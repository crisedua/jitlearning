/**
 * The pricing page.
 *
 * Prices are read from the `plans` table at request time rather than compiled
 * in, so changing one is a row update instead of a deploy — and so the number a
 * visitor is quoted is the same number the usage limits are enforced against.
 * `src/lib/plans.ts` holds the card copy and a fallback copy of the figures for
 * when the database cannot be reached.
 *
 * The order on the page is deliberate: the individual tiers first, because
 * that is what someone arriving alone can buy; then Empresa, full-width and
 * featured, because it is the offer with a salesperson behind it; then Equipo
 * as the smaller organisational option.
 *
 * There is no checkout here, because there is no payment integration yet. The
 * paid tiers link to a real person or say nothing; what they must not do is
 * offer a button that pretends to take money.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { anonKey, authConfigured, supabaseUrl } from '@/lib/supabase/env';
import { PROFILE } from '@/lib/site';
import {
  FALLBACK_PLANS,
  PLAN_COLUMNS,
  PLAN_FEATURES,
  RECOMMENDED_PLAN_ID,
  approximateSessions,
  formatMinutes,
  formatMoney,
  formatOverage,
  rowToPlan,
  type Plan,
} from '@/lib/plans';

export const metadata: Metadata = {
  title: 'Planes · ModoJIT',
  description:
    'Planes de ModoJIT por minutos de conversación: gratis para probar, tres tamaños según cuánto lo uses, y el plan Empresa — su propio coach, con su material, en su dominio.',
};

/** Prices change without a deploy, so the page must not be cached forever. */
export const revalidate = 300;

const EMPRESA_ID = 'empresa';

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
async function loadPlans(): Promise<readonly Plan[]> {
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
 * The free plan starts a conversation, because that is a thing this deployment
 * can actually do. A paid plan cannot be bought yet, so it writes to whoever
 * runs this — and when no address has been filled in at `src/lib/site.ts`, it
 * says so plainly rather than rendering a button that goes nowhere.
 */
function PlanAction({ plan }: { plan: Plan }) {
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

  if (!PROFILE.email) {
    return (
      <p className="mt-7 rounded-full border border-dashed border-line-strong px-5 py-2.5 text-center text-[15px] text-soft">
        Disponible pronto
      </p>
    );
  }

  const subject = encodeURIComponent(`Plan ${plan.name}`);
  const recommended = plan.id === RECOMMENDED_PLAN_ID;

  return (
    <a
      href={`mailto:${PROFILE.email}?subject=${subject}`}
      className={
        recommended
          ? 'mt-7 inline-flex w-full items-center justify-center rounded-full bg-accent px-5 py-2.5 text-[15px] font-medium text-bg transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-accent-hover'
          : 'mt-7 inline-flex w-full items-center justify-center rounded-full border border-line-strong px-5 py-2.5 text-[15px] font-medium text-ink transition duration-200 ease-out hover:-translate-y-0.5 hover:border-accent hover:text-accent'
      }
    >
      Quiero este plan
    </a>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  const recommended = plan.id === RECOMMENDED_PLAN_ID;
  const organisation = plan.id === EMPRESA_ID;
  const features = PLAN_FEATURES[plan.id] ?? [];
  const sessions = approximateSessions(plan.monthlyMinutes);

  return (
    <li
      className={`reveal relative flex flex-col rounded-lg border bg-surface p-7 transition duration-300 ease-out hover:-translate-y-1.5 hover:shadow-md ${
        recommended || organisation
          ? 'border-accent/45 shadow-sm ring-1 ring-accent/15'
          : 'border-line hover:border-accent/35'
      }`}
    >
      {recommended && (
        <span className="absolute -top-3 left-7 rounded-full border border-gold/45 bg-gold-soft px-3 py-1 text-[10px] font-semibold uppercase leading-none tracking-[0.1em] text-accent">
          El más elegido
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
        <span className="text-[15px] text-soft">
          {plan.priceMinor === 0 ? '' : plan.seatMinimum ? '/persona al mes' : '/mes'}
        </span>
      </p>
      {plan.setupMinor !== null && (
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          + {formatMoney(plan.setupMinor, plan.currency)} de implementación, por una vez
        </p>
      )}

      {plan.blurb && <p className="mt-3 text-[15px] leading-relaxed text-muted">{plan.blurb}</p>}

      <p className="mt-6 border-t border-line pt-5 text-[17px] font-medium text-ink">
        {plan.seatMinimum
          ? `${formatMinutes(plan.monthlyMinutes)} por persona al mes`
          : `${formatMinutes(plan.monthlyMinutes)} de conversación al mes`}
      </p>
      {sessions !== null && sessions > 0 && (
        <p className="mt-1 text-[14px] text-soft">
          unas {sessions} consultas{plan.seatMinimum ? ' cada una' : ''}
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

      <PlanAction plan={plan} />
    </li>
  );
}

export default async function PlanesPage() {
  const plans = await loadPlans();
  const selfServe = plans.filter((p) => p.isPublic);
  const empresa =
    plans.find((p) => p.id === EMPRESA_ID) ?? FALLBACK_PLANS.find((p) => p.id === EMPRESA_ID)!;
  const currency = plans[0]?.currency ?? 'USD';

  return (
    <>
      <section className="mx-auto max-w-[96rem] px-6 pb-16 pt-20 lg:pt-24">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Planes</p>
        <h1 className="mt-4 max-w-[20ch] font-serif text-[clamp(2.25rem,5vw,3.75rem)] font-normal leading-[1.04] tracking-[-0.02em]">
          Se paga por{' '}
          <span className="relative inline-block">
            minuto
            <span
              aria-hidden
              className="absolute inset-x-0 bottom-[0.1em] -z-10 h-[0.32em] bg-gold-soft"
            />
          </span>{' '}
          hablado
        </h1>
        <p className="mt-6 max-w-[58ch] text-[17px] leading-relaxed text-muted">
          No por pregunta ni por asiento. Una consulta de dos minutos cuesta dos minutos, y un plan
          que te queda grande se nota en la factura del mes siguiente en vez de al año.
        </p>
      </section>

      <section className="mx-auto max-w-[96rem] px-6 pb-20">
        {/* Five across only where five fit; below that the cards pair up. */}
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {[...selfServe, empresa].map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </ul>

        <p className="mt-6 text-[13px] text-soft">
          Precios en {currency === 'CLP' ? 'pesos chilenos' : 'dólares'}, sin IVA. Puedes cambiar de
          plan o cancelar cuando quieras.
        </p>
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

            <div className="reveal">
              <dt className="text-[17px] font-medium text-ink">
                El contador vuelve a cero el día 1
              </dt>
              <dd className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-muted">
                Mes calendario. Los minutos que no usaste no se acumulan para el mes siguiente.
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
            Pruébalo antes de elegir tamaño
          </h2>
          <p className="mt-5 max-w-[52ch] text-[17px] leading-relaxed text-bg/75">
            Veinte minutos gratis, sin tarjeta. Es tiempo suficiente para saber si sabe de lo tuyo,
            que es lo único que importa antes de pagar.
          </p>
          <Link
            href="/coach"
            className="mt-9 inline-flex items-center gap-2.5 rounded-full bg-bg px-6 py-3 text-[16px] font-medium text-ink transition duration-200 ease-out hover:-translate-y-0.5"
          >
            Hablar con el coach
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
