/**
 * The pricing page.
 *
 * Prices are read from the `plans` table at request time rather than compiled
 * in, so changing one is a row update instead of a deploy — and so the number a
 * visitor is quoted is the same number the usage limits are enforced against.
 * `src/lib/plans.ts` holds the card copy and a fallback copy of the figures for
 * when the database cannot be reached.
 *
 * The paid cards open a Stripe checkout, but only for a plan that actually has a
 * price created in Stripe (`plans.stripe_price_id`). A plan without one falls back
 * to writing to a person: a button that pretends to take money and then cannot is
 * worse than one that admits it is not ready, and this page will be read by people
 * deciding whether to trust us with a card.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { anonKey, authConfigured, supabaseUrl } from '@/lib/supabase/env';
import { CheckoutButton } from '@/components/CheckoutButton';
import { IntentLink } from '@/components/IntentLink';
import { billingConfigured } from '@/lib/billing';
import { withDeadline } from '@/lib/deadline';
import { PROFILE, WHATSAPP } from '@/lib/site';
import {
  FALLBACK_PLANS,
  FREE_PLAN,
  PAID_PLANS,
  PLAN_COLUMNS,
  planFeatures,
  RECOMMENDED_PLAN_ID,
  approximateSessions,
  dominatedBy,
  formatMinutes,
  formatMoney,
  formatOverage,
  rowToPlan,
  spellMinutes,
  type Plan,
} from '@/lib/plans';

export const metadata: Metadata = {
  title: 'Planes · ModoJIT',
  /*
   * Both numbers derived. This said "20 minutos gratis" and "2 planes
   * mensuales" as literals, on the page whose premise is that the figures come
   * from the plans table — and the second one is the sentence that would have
   * gone wrong the day somebody retired a tier, which `npm run doctor` is
   * currently recommending.
   *
   * Metadata is static, so it reads the compiled fallback rather than Postgres.
   * That is the same array the page falls back to when the database cannot be
   * reached, which makes it the closest to one source this can get.
   */
  description: `Planes de ModoJIT por minutos de clase: ${formatMinutes(
    FREE_PLAN.monthlyMinutes,
  )} gratis para resolver una tarea de tu semana y medir lo que ahorra, y ${
    PAID_PLANS.length
  } planes mensuales para el currículum completo.`,
};

/** Prices change without a deploy, so the page must not be cached forever. */
export const revalidate = 300;

/*
 * The per-seat Empresa tier is retired along with the product it was priced for.
 * The card logic that special-cased it is gone; what remains works off the
 * public plans the table returns, so retiring another tier is a row update.
 */

/**
 * The plans, from Postgres when it is available.
 *
 * Deliberately *not* the cookie-bound client from `src/lib/supabase/server.ts`.
 * That one exists to act as the signed-in learner, and touching cookies would
 * opt this page out of static rendering — so a public price list would hit
 * Postgres on every request for rows that are identical for everyone. A plain
 * anon client keeps the page on the revalidation schedule above.
 *
 * Falls back to the compiled copy on any failure — unconfigured environment,
 * network error, or an empty result. An empty result is worth calling out: it
 * is what row-level security returns to an anonymous visitor when the public
 * read policy is missing, and it arrives with no error attached. That is why the
 * fallback logs: silently serving stale prices is exactly the failure this page
 * cannot afford.
 */
/**
 * Long enough for a healthy read, short enough that nobody leaves.
 *
 * This page revalidates, so one slow render is served to whoever asked for it
 * and cached for everybody after. Past a couple of seconds a visitor on a phone
 * has already decided the site is broken, and the compiled prices are right
 * anyway — the fallback exists for exactly this and was only reachable by an
 * error, never by a wait.
 */
const PLANS_DEADLINE_MS = 2_500;

async function loadPlans(): Promise<readonly Plan[]> {
  /*
   * Every failure here already falls back to the compiled prices: an
   * unconfigured environment, a network error, an empty result. A read that
   * simply never answers did not, because a hanging promise is not an error and
   * the try below has nothing to catch. It hung until the platform gave up, and
   * what the visitor got in the meantime was the page that asks for money,
   * blank.
   *
   * The same treatment `learnerRecord` and the summary lookup already had, on
   * the one page here whose whole job is to be read by a stranger.
   */
  return withDeadline(read(), FALLBACK_PLANS, PLANS_DEADLINE_MS);
}

async function read(): Promise<readonly Plan[]> {
  if (!authConfigured()) return FALLBACK_PLANS;

  try {
    const supabase = createClient(supabaseUrl(), anonKey(), {
      // No user to keep signed in, and no cookie jar to read one from.
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase
      .from('plans')
      .select(PLAN_COLUMNS)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('[planes] could not read plans, showing compiled prices:', error.message);
      return FALLBACK_PLANS;
    }
    if (!data || data.length === 0) {
      console.error(
        '[planes] plans table returned no rows — is the anon read policy missing? Showing compiled prices.',
      );
      return FALLBACK_PLANS;
    }
    return data.map(rowToPlan);
  } catch (err) {
    console.error('[planes] plans lookup failed, showing compiled prices:', err);
    return FALLBACK_PLANS;
  }
}

/** A checkmark. Decorative — the list item's text carries the meaning. */
function Check() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden
      focusable="false"
      fill="none"
      className="mt-[3px] shrink-0"
    >
      <path
        d="M3 8.5 6.2 11.5 13 4.5"
        className="stroke-accent"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * What the card's button does.
 *
 * The free plan starts a session. The paid ones open a Stripe checkout, unless
 * this deployment has no Stripe key or the plan has no price created yet, in which
 * case they fall back to writing to a person — a button that opens a dead checkout
 * is worse than one that says it is not ready.
 *
 * `buyable` is resolved on the server, per plan, from `plans.stripe_price_id`. It
 * is not a global flag: the founder tier can be purchasable while a later tier is
 * still being set up, and the page should tell the truth about each.
 */
function PlanAction({ plan, buyable }: { plan: Plan; buyable: boolean }) {
  if (plan.priceMinor === 0) {
    return (
      <Link
        href="/coach"
        className="mt-7 inline-flex w-full items-center justify-center rounded-full border border-line-strong px-5 py-2.5 text-[15px] font-medium text-ink transition duration-200 ease-out hover:-translate-y-0.5 hover:border-accent hover:text-accent"
      >
        Empezar gratis
      </Link>
    );
  }

  if (buyable) {
    return (
      <CheckoutButton
        plan={plan.id}
        label={`Contratar ${plan.name}`}
        recommended={plan.id === RECOMMENDED_PLAN_ID}
      />
    );
  }

  if (!PROFILE.email) {
    return (
      <p className="mt-7 rounded-full border border-dashed border-line-strong px-5 py-2.5 text-center text-[15px] text-soft">
        Disponible pronto
      </p>
    );
  }

  /*
   * A message that is already written.
   *
   * While checkout is not configured this link is one of the two ways anybody can
   * say they want to pay — the other is the offer under the measured hours on
   * /progreso, which came later and does the same thing — and it used to open an
   * empty draft with a subject line.
   * That asks somebody who has just decided to buy to compose a message to a
   * stranger, at the exact moment their intent is highest and most perishable.
   * Plenty of people close that window.
   *
   * Prefilled, the click produces a complete sendable message that also tells
   * the reader which plan and which price, so no one has to go back and look.
   */
  const subject = encodeURIComponent(`Quiero el plan ${plan.name}`);
  const body = encodeURIComponent(
    `Hola, quiero contratar el plan ${plan.name} (${formatMoney(plan.priceMinor, plan.currency)} al mes). ¿Cómo seguimos?`,
  );
  const whatsapp = `https://wa.me/${WHATSAPP.number}?text=${body}`;

  return (
    <>
      <IntentLink
        href={`mailto:${PROFILE.email}?subject=${subject}&body=${body}`}
        plan={plan.id}
        channel="email"
        className="mt-7 inline-flex w-full items-center justify-center rounded-full bg-accent px-5 py-2.5 text-[15px] font-medium text-bg transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-accent-hover"
      >
        Conversemos
      </IntentLink>
      {/*
        WhatsApp beside it, carrying the same prefilled sentence. The floating
        button on every page opens a generic "tengo una consulta", which is not
        the same thing as naming the plan somebody just chose — and in the market
        this is sold in, WhatsApp is the channel people actually answer.
      */}
      <IntentLink
        href={whatsapp}
        plan={plan.id}
        channel="whatsapp"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2.5 text-center text-[13px] text-muted underline underline-offset-2 hover:text-accent"
      >
        o por WhatsApp
      </IntentLink>
    </>
  );
}

function PlanCard({
  plan,
  buyable,
  supersededBy,
}: {
  plan: Plan;
  buyable: boolean;
  supersededBy: Plan | null;
}) {
  // A dominated tier is not an option, so it does not get the recommendation
  // ring or the button. See `dominatedBy` for why it stays on the page at all.
  const recommended = !supersededBy && plan.id === RECOMMENDED_PLAN_ID;
  const organisation = plan.seatMinimum !== null;
  const features = planFeatures(plan);
  const sessions = approximateSessions(plan.monthlyMinutes);

  return (
    <li
      className={`reveal relative flex flex-col rounded-lg border p-7 transition duration-300 ease-out ${
        supersededBy
          ? 'border-line bg-surface-alt/30'
          : 'bg-surface hover:-translate-y-1.5 hover:shadow-md'
      } ${
        recommended || organisation
          ? 'border-accent/45 shadow-sm ring-1 ring-accent/15'
          : supersededBy
            ? ''
            : 'border-line hover:border-accent/35'
      }`}
    >
      {/*
        This badge said "El más elegido" — the most chosen — which is a claim
        about what other customers did, on a product that has none. An
        unverifiable statistic is the one thing `site.ts` names in its own copy
        rules as out of bounds, and the fourth promise on the landing page is
        "No inventa. Ninguna cifra sin fuente." A fabricated popularity claim on
        the page that asks for money disproves that promise more cheaply than any
        answer the teacher could give.

        The badge still does its job: it marks the tier this product points
        somebody at. It just owns the recommendation instead of attributing it to
        a crowd, which is the same distinction the persona is required to make
        between a sourced fact and its own judgement.
      */}
      {recommended && (
        <span className="absolute -top-3 left-7 rounded-full border border-gold/45 bg-gold-soft px-3 py-1 text-[10px] font-semibold uppercase leading-none tracking-[0.1em] text-accent">
          El que recomendamos
        </span>
      )}
      {supersededBy && (
        <span className="absolute -top-3 left-7 rounded-full border border-line-strong bg-surface px-3 py-1 text-[10px] font-semibold uppercase leading-none tracking-[0.1em] text-soft">
          Precio de lista
        </span>
      )}
      {organisation && (
        <span className="absolute -top-3 left-7 rounded-full border border-gold/45 bg-gold-soft px-3 py-1 text-[10px] font-semibold uppercase leading-none tracking-[0.1em] text-accent">
          Para tu organización
        </span>
      )}

      <h2 className="font-serif text-[26px] font-normal leading-none tracking-[-0.01em]">
        {plan.name}
      </h2>

      <p className="mt-4 flex items-baseline gap-1.5">
        <span className="font-mono text-[34px] font-medium leading-none tracking-[-0.02em] text-ink">
          {formatMoney(plan.priceMinor, plan.currency)}
        </span>
        <span className="text-[15px] text-soft">{plan.priceMinor === 0 ? '' : '/mes'}</span>
      </p>
      {plan.setupMinor !== null && (
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          + {formatMoney(plan.setupMinor, plan.currency)} de implementación, por una vez
        </p>
      )}

      {plan.blurb && <p className="mt-3 text-[15px] leading-relaxed text-muted">{plan.blurb}</p>}

      {/*
        "al mes" is a claim, not a label. The free tier is a lifetime 20 minutes
        and the gate enforces it that way, so saying "al mes" here would promise
        240 free minutes a year that nobody gets.
      */}
      <p className="mt-6 border-t border-line pt-5 text-[17px] font-medium text-ink">
        {plan.period === 'total'
          ? `${formatMinutes(plan.monthlyMinutes)} de clase en total`
          : `${formatMinutes(plan.monthlyMinutes)} de clase al mes`}
      </p>
      {sessions !== null && sessions > 0 && (
        <p className="mt-1 text-[14px] text-soft">
          {/*
            "unas" is an approximation, and an approximation of two is a strange
            thing to offer somebody. It reads correctly at thirty, which is what
            a paid month now holds, and badly at the two the free tier became
            when a class stopped being fifteen minutes and started being ten.
            Hedged only where the hedge means something.
          */}
          {sessions === 1
            ? 'alcanza para la primera clase'
            : sessions <= 3
              ? `alcanza para ${sessions} clases`
              : `unas ${sessions} clases`}
        </p>
      )}
      {plan.seatMinimum && (
        <p className="mt-1 text-[14px] text-soft">desde {plan.seatMinimum} personas</p>
      )}

      {features.length > 0 && (
        <ul className="mt-5 flex flex-col gap-2.5 text-[15px] leading-relaxed text-muted">
          {features.map((feature) => (
            <li key={feature} className="flex gap-2.5">
              <Check />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Pushes the price of going over, and the button, to the bottom of every
          card regardless of how many bullets each one has. */}
      <span className="flex-1" />

      <p className="mt-6 text-[13px] leading-relaxed text-soft">{formatOverage(plan)}</p>

      {/*
        No button. Charging somebody more for less is not an option to present
        politely, and a card with a button reads as a choice worth weighing.
        The sentence says the useful thing instead: which plan to take, and why
        this number is on the page at all.
      */}
      {supersededBy ? (
        <p className="mt-6 border-t border-line pt-5 text-[14px] leading-relaxed text-muted">
          Este es el precio sin el descuento de fundador. Mientras {supersededBy.name} siga
          abierto, cuesta {formatMoney(supersededBy.priceMinor, supersededBy.currency)} y te da lo
          mismo, así que toma ese.
        </p>
      ) : (
        <PlanAction plan={plan} buyable={buyable} />
      )}
    </li>
  );
}

export default async function PlanesPage() {
  const plans = await loadPlans();

  /*
   * The free tier's allowance, for the metering copy below. Read from the plan
   * rather than written into the prose: this page's rule is that every number it
   * states comes from the row it describes.
   */
  const freeMinutes = plans.find((p) => p.period === 'total')?.monthlyMinutes ?? null;
  const selfServe = plans.filter((p) => p.isPublic);
  const currency = plans[0]?.currency ?? 'USD';

  /*
   * Which plans can actually be charged for, resolved once per render.
   *
   * Two conditions, both required: this deployment has a Stripe key, and the plan
   * row carries a price id. `loadPlans` reads through the public anon client and
   * the fallback rows carry no price id at all, so a Postgres outage degrades to
   * the write-to-a-person button rather than to a broken checkout.
   */
  const buyable = new Set(
    billingConfigured() ? selfServe.filter((p) => p.stripePriceId).map((p) => p.id) : [],
  );

  return (
    <>
      <section className="mx-auto max-w-[96rem] px-6 pb-16 pt-20 lg:pt-24">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Planes</p>
        <h1 className="mt-4 max-w-[22ch] font-serif text-[clamp(2.25rem,5vw,3.75rem)] font-normal leading-[1.04] tracking-[-0.02em]">
          Primero mides lo que ahorras.{' '}
          <span className="relative inline-block">
            Después
            <span
              aria-hidden
              className="absolute inset-x-0 bottom-[0.1em] -z-10 h-[0.32em] bg-gold-soft"
            />
          </span>{' '}
          decides.
        </h1>
        {/*
          A value frame, not a metering frame.
          
          This page used to open with "se paga por minuto hablado", which is a true
          and completely uninteresting fact about how the counter works. Somebody
          reading a pricing page is deciding whether this is worth money, and the
          honest answer to that is a number they produce themselves in the free
          tier. The metering explanation is still on the page, further down, where
          it belongs: it answers a question people ask second.
        */}
        <p className="mt-6 max-w-[58ch] text-[17px] leading-relaxed text-muted">
          Los {spellMinutes(FREE_PLAN.monthlyMinutes ?? 0)} gratis alcanzan para resolver una tarea real de tu semana y medir cuánto
          tiempo te ahorra cada vez que la vuelves a hacer. Ese número lo pones tú. Compáralo con
          estos precios y la decisión se toma sola.
        </p>
      </section>

      <section className="mx-auto max-w-[96rem] px-6 pb-20">
        {/* Five across only where five fit; below that the cards pair up. */}
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {selfServe.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              buyable={buyable.has(plan.id)}
              supersededBy={dominatedBy(plan, selfServe)}
            />
          ))}
        </ul>

  
      </section>

      {/*
        The question every metered product gets asked, answered before anyone
        has to ask it. Each claim here is one the code actually makes true — see
        the `plan_usage` view and `scripts/sync-usage.ts`.
      */}
      <section className="border-t border-line bg-surface-alt py-20 lg:py-24">
        <div className="mx-auto max-w-[96rem] px-6">
          <p className="reveal text-xs font-semibold uppercase tracking-[0.14em] text-accent">
            Cómo se cuentan
          </p>
          <h2 className="reveal mt-4 max-w-[24ch] font-serif text-[clamp(2rem,4.5vw,3rem)] font-normal leading-[1.08] tracking-[-0.02em]">
            Qué cuenta como un minuto
          </h2>

          <dl className="mt-12 grid gap-x-12 gap-y-9 md:grid-cols-2">
            <div className="reveal">
              <dt className="text-[17px] font-medium text-ink">
                El tiempo de la conversación, no las preguntas
              </dt>
              <dd className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-muted">
                Se mide desde que se abre la conexión hasta que se cierra. Preguntar cinco cosas en
                un minuto cuesta un minuto.
              </dd>
            </div>

            <div className="reveal">
              <dt className="text-[17px] font-medium text-ink">En segundos, sin redondear</dt>
              <dd className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-muted">
                Doce conversaciones de noventa segundos son dieciocho minutos, no veinticuatro. No
                se cobra la sesión completa por haberla empezado.
              </dd>
            </div>

            {/*
              Two windows, said as two, because they are not the same and the
              difference is the whole reason to pay.

              This claimed flatly that the counter resets on the 1st and unused
              minutes do not carry over. True of every paid plan and false of the
              free one, which is `period: 'total'`: twenty minutes once, for
              good. So the page where somebody decides whether to buy told them
              their free minutes come back every month, which is both untrue and
              the best possible argument against buying anything. The same
              sentence was already wrong in the balance meter and was fixed
              there; it survived here, on the more expensive page.
            */}
            <div className="reveal">
              <dt className="text-[17px] font-medium text-ink">
                Los planes vuelven a cero el día 1; el gratis no vuelve
              </dt>
              <dd className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-muted">
                En un plan de pago el contador se reinicia cada mes calendario y los minutos que no
                usaste no se acumulan.{' '}
                {freeMinutes !== null
                  ? `Los ${freeMinutes} minutos gratis son otra cosa: son una sola vez, para que pruebes, y no se renuevan.`
                  : 'Los minutos gratis son otra cosa: son una sola vez, para que pruebes, y no se renuevan.'}
              </dd>
            </div>

            <div className="reveal">
              <dt className="text-[17px] font-medium text-ink">
                La cifra se verifica contra el proveedor
              </dt>
              <dd className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-muted">
                Lo que mide tu navegador sirve para mostrarte el saldo al instante. Lo que se factura
                es lo que registró ElevenLabs, que es quien cronometra la llamada.
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="mx-auto max-w-[96rem] px-6 py-20 lg:py-24">
        <div className="reveal rounded-xl bg-accent-hover px-8 py-14 sm:px-14 sm:py-16">
          <h2 className="max-w-[20ch] font-serif text-[clamp(1.875rem,4vw,2.75rem)] font-normal leading-[1.06] tracking-[-0.02em] text-bg">
            Haz la primera clase antes de elegir
          </h2>
          <p className="mt-5 max-w-[52ch] text-[17px] leading-relaxed text-bg/75">
            Veinte minutos gratis, sin tarjeta, y alcanzan para resolver una tarea de tu semana y
            medir cuánto te ahorra. Compara ese número con el precio antes de pagar nada: nosotros
            no lo inventamos, lo mides tú.
          </p>
          <Link
            href="/coach"
            className="mt-9 inline-flex items-center gap-2.5 rounded-full bg-bg px-6 py-3 text-[16px] font-medium text-ink transition duration-200 ease-out hover:-translate-y-0.5"
          >
            Empezar la primera clase
            <span
              aria-hidden
              className="h-[7px] w-[7px] rounded-full bg-gold [animation:ring_2.2s_ease-out_infinite]"
            />
          </Link>
        </div>
      </section>
    </>
  );
}
