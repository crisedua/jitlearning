import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SessionBar } from '@/components/SessionBar';
import { currentUser } from '@/lib/supabase/server';
import { signInPath } from '@/lib/paths';
import {
  careerProfile,
  currentStep,
  planSteps,
  sessionHistory,
  timeSaved,
  type CareerProfile,
  type PlanStep,
  type SessionRecord,
  type TimeSaved,
} from '@/lib/progress';
import { LEVELS, PATHS, stepDetail, type LevelId, type PathId } from '@/lib/curriculum';
import { subscriptionFor, type Subscription } from '@/lib/billing';
import { getUsageBalance } from '@/lib/account';
import { formatMinutes, formatMoney, spellMinutes, type Plan } from '@/lib/plans';
import { recommendedPlan } from '@/lib/offer';
import { BillingLink } from '@/components/BillingLink';
import { CheckoutButton } from '@/components/CheckoutButton';
import { saveEvidence, setCommitmentDone } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Tu progreso · ModoJIT',
};

/**
 * The notebook.
 *
 * Voice is the classroom and this is everything the classroom cannot hold: a
 * plan of eleven steps, the map as it was given, and the history of what was
 * promised. None of it would survive being read aloud, and all of it is the
 * reason to come back between sessions.
 *
 * Server components throughout, with one exception: the checkout button in the
 * offer, which needs a fetch and a redirect and cannot be a form post. Two forms
 * posting to server actions carry the rest. Everything that can be read is
 * readable on a phone on a bus with nothing running, which is where it will be
 * read.
 */
export default async function ProgresoPage({
  searchParams,
}: {
  searchParams: Promise<{ pago?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect(signInPath('/progreso'));

  const [profile, steps, history, subscription, balance, offer, params] = await Promise.all([
    careerProfile(user.id),
    planSteps(user.id),
    sessionHistory(user.id),
    subscriptionFor(user.id),
    getUsageBalance(user.id, user.email),
    recommendedPlan(),
    searchParams,
  ]);

  const current = currentStep(steps);
  const saved = timeSaved(steps);

  return (
    <div className="mx-auto max-w-4xl space-y-12 px-6 py-10">
      <header>
        <div className="mb-5 flex justify-end">
          <SessionBar />
        </div>
        <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-accent">
          <span aria-hidden className="inline-block h-px w-[34px] bg-gold" />
          Tu cuaderno
        </p>
        <h1 className="mt-3 font-serif text-[clamp(2rem,4.5vw,2.875rem)] font-normal leading-[1.05] tracking-[-0.02em]">
          Tu mapa y tu plan
        </h1>
        <p className="mt-3 max-w-2xl text-[17px] leading-relaxed text-muted">
          Lo que hablaste por voz, escrito. El estado de cada paso lo pone la clase; lo que
          construiste y si cumpliste, lo pones tú.
        </p>

        <Link
          href="/coach"
          className="mt-5 inline-flex items-center gap-2.5 rounded-full bg-accent px-6 py-3 text-[15px] font-medium text-white shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-accent-hover"
        >
          {steps.length > 0 ? 'Seguir con la clase' : 'Empezar la primera clase'}
          <span aria-hidden className="font-mono">
            →
          </span>
        </Link>
      </header>

      {params.pago === 'listo' && <PagoListo />}

      {saved.perWeek > 0 && <Recuperado saved={saved} />}

      {/*
        The offer goes directly under the number, and only for somebody still on
        the free tier who has one. That pairing is the entire argument: the hours
        are theirs and measured, the price is small and next to it. Anywhere else
        on the page it would be an ad; here it is arithmetic the reader can do.
      */}
      {subscription?.planId === 'free' && saved.perWeek > 0 && offer && (
        <Ofrecer saved={saved} minutesLeft={freeMinutesLeft(balance)} plan={offer} />
      )}

      {subscription && subscription.planId !== 'free' && (
        <Suscripcion subscription={subscription} />
      )}

      {!profile && <FirstVisit />}

      {profile && <Mapa profile={profile} />}

      {steps.length > 0 && <Plan steps={steps} currentId={current?.step.id ?? null} />}

      {profile && steps.length === 0 && <PlanPending profile={profile} />}

      {history.length > 0 && <Historial history={history} />}
    </div>
  );
}

/** Free minutes remaining, or null when this deployment does not meter. */
function freeMinutesLeft(balance: Awaited<ReturnType<typeof getUsageBalance>>): number | null {
  if (!balance || balance.monthlyMinutes === null) return null;
  return Math.max(0, Math.floor(balance.monthlyMinutes - balance.minutes));
}

/**
 * The one place this product asks to be paid.
 *
 * It states the learner's own weekly figure and the price, and does the division
 * for nobody: no "worth $X of your time", because that needs an hourly wage this
 * product does not know and must not invent. Hours against dollars, both real, and
 * the reader closes the gap themselves.
 *
 * The price and the minutes are read from the database rather than written here.
 * They were hardcoded for about ten minutes, which would have made this paragraph
 * lie the first time somebody changed a price — the exact drift the pricing page
 * has always avoided by reading `plans` at request time.
 *
 * ## The button used to go to /planes, and the reason it no longer does
 *
 * It sent people to the pricing page on the argument that somebody deciding
 * wants to see the tiers, and that shaving the click would read as a trick at
 * the moment trust matters most. The concern was about hiding the alternatives,
 * and it was right about that. It was wrong about the remedy: the paragraph
 * above has already named this plan, this price and this allowance, so the
 * pricing page was not showing them a choice, it was making them find the row
 * they had just read and decide again without their own number in front of them.
 *
 * Nothing is hidden now instead. The button states the plan and the exact monthly
 * charge on its face, and the comparison is one link below it. That answers the
 * trust objection more directly than a detour did, because the price is on the
 * thing you press rather than on a page you have to go and read.
 */
function Ofrecer({
  saved,
  minutesLeft,
  plan,
}: {
  saved: TimeSaved;
  minutesLeft: number | null;
  plan: Plan;
}) {
  const outOfMinutes = minutesLeft !== null && minutesLeft <= 5;

  return (
    <section className="rounded-lg border border-accent/40 bg-accent-soft/25 p-6 ring-1 ring-accent/10">
      <h2 className="font-serif text-[22px] font-normal leading-snug tracking-[-0.01em]">
        Te quedan {saved.tasksMeasured === 1 ? 'las otras tareas' : 'las tareas que faltan'} de tu
        semana.
      </h2>
      <p className="mt-3 max-w-[58ch] text-[15px] leading-relaxed text-ink/85">
        Con una sola tarea ya recuperas {spellMinutes(saved.perWeek)} cada semana, medidos por ti.
        El plan {plan.name} cuesta {formatMoney(plan.priceMinor, plan.currency)} al mes y son{' '}
        {formatMinutes(plan.monthlyMinutes)} de clase: alcanza para las 3 a 5 tareas de tu semana,
        el nivel 2 y el portafolio.
      </p>
      {outOfMinutes && (
        <p className="mt-2 text-[14px] leading-relaxed text-warning">
          {minutesLeft === 0
            ? 'Ya usaste tus minutos gratis.'
            : `Te quedan ${minutesLeft} minutos gratis.`}
        </p>
      )}
      {/*
       * The checkout itself, not a link to a page that sells it.
       *
       * This is the highest-intent moment the product has: the sentence above
       * just told them, in their own measured numbers, what they get back each
       * week, and named this plan and this price. Sending them to a comparison
       * table from here asks them to make the decision a second time, without
       * the number that made it, and the plan they would be comparing is the one
       * already named. `plan` is the recommended plan the page resolved, so the
       * button buys exactly what the paragraph describes.
       */}
      <div className="mt-5 max-w-[22rem]">
        <CheckoutButton
          plan={plan.id}
          label={`Activar ${plan.name} · ${formatMoney(plan.priceMinor, plan.currency)} al mes`}
          recommended
        />
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-soft">
        Cancelas cuando quieras, desde esta misma página.{' '}
        <Link href="/planes" className="underline underline-offset-2 hover:text-accent">
          Ver todos los planes
        </Link>
        .
      </p>
    </section>
  );
}

/**
 * Just came back from Stripe.
 *
 * Says the plan may take a moment on purpose. The redirect and the webhook race,
 * and the redirect usually wins, so a page that promised an upgraded account here
 * would look broken at the exact moment somebody has handed over a card.
 */
function PagoListo() {
  return (
    <section className="rounded-lg border border-success/30 bg-success-soft/40 px-5 py-4">
      <h2 className="text-[15px] font-semibold text-success">Pago recibido. Gracias.</h2>
      <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-ink/85">
        Tu plan puede tardar unos segundos en aparecer acá: lo activamos cuando el pago queda
        confirmado, no cuando vuelves de la pasarela. Si en un minuto sigue igual, recarga.
      </p>
    </section>
  );
}

/**
 * What they are paying for, and the one click that changes it.
 *
 * ## Comped plans are a real case, not an edge case
 *
 * The feedback deal grants 3 months of a paid plan by hand: `plan_id` is set with
 * no Stripe customer behind it. Those people are the first ten through the door
 * and the ones whose reaction decides whether any of this sells, so the page they
 * land on cannot be broken for them. Without this branch they were shown an
 * "Administrar mi plan" button that 404s, on the plan they were given as a thank
 * you.
 *
 * `hasCustomer` is the discriminator: a plan with no customer was granted, not
 * bought, so it says so and offers nothing to manage.
 */
function Suscripcion({ subscription }: { subscription: Subscription }) {
  const lapsed =
    subscription.status !== null &&
    !['active', 'trialing'].includes(subscription.status);
  const comped = !subscription.hasCustomer;

  return (
    <section className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 rounded-lg border border-line bg-surface-alt/50 px-5 py-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-soft">Tu plan</p>
        <p className="mt-1 text-[15px] text-ink/85">
          {subscription.planId === 'founder' ? 'Fundador' : 'Estándar'}
          {comped && <span className="text-muted"> · de cortesía</span>}
          {subscription.endsAt && (
            <span className="text-muted">
              {' '}
              · {lapsed ? 'termina' : 'se renueva'} el{' '}
              {new Date(subscription.endsAt).toLocaleDateString('es-CL', {
                day: 'numeric',
                month: 'long',
              })}
            </span>
          )}
        </p>
        {lapsed && (
          <p className="mt-1 text-[13px] text-warning">
            Hay un problema con el cobro. Revisa tu tarjeta para no perder los minutos.
          </p>
        )}
        {comped && (
          /*
           * Say when it ends, and what "ends" actually means.
           *
           * A granted plan reverts to free on `plan_granted_until`, and this
           * said only "no hay nada que pagar ni que cancelar" — true, and quiet
           * about the date. Somebody would have found out by being turned away
           * mid-question, which is both a bad surprise and the worst moment to
           * ask anybody for anything.
           *
           * The first version of this fix said "y después vuelve al plan
           * gratis", which reads as twenty minutes waiting on the other side.
           * It is not. `plan_usage_total` counts minutes over the whole life of
           * the account, and the free tier is twenty of them once, so anybody
           * who had three months of a paid plan has spent them long ago and
           * reverting means stopping. Saying "vuelve a gratis" would set up the
           * same surprise one sentence later.
           */
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            Te lo activamos nosotros: no hay nada que pagar ni que cancelar.
            {subscription.grantedUntil
              ? ` Va hasta el ${new Date(subscription.grantedUntil).toLocaleDateString('es-CL', {
                  day: 'numeric',
                  month: 'long',
                })}. Los minutos gratis se cuentan una sola vez desde que te registraste, así que para seguir después de esa fecha necesitarías un plan.`
              : ''}
          </p>
        )}
      </div>
      {!comped && <BillingLink />}
    </section>
  );
}

/** Minutes into something a person says out loud: "3 horas y 20 minutos". */
/**
 * The headline number, and the only claim this product makes about its own value.
 *
 * It is the learner's own arithmetic: for each weekly task they finished, the
 * minutes they said it used to take minus the minutes they said it took with what
 * they built. Not an average, not a benchmark, not ours. The per-task rows are
 * shown underneath precisely so the total can be checked rather than believed —
 * a number you cannot audit is a number nobody trusts twice.
 *
 * There is deliberately no cumulative total. Weekly saving times weeks elapsed
 * would be the biggest number on the page and the least defensible one.
 */
function Recuperado({ saved }: { saved: TimeSaved }) {
  return (
    <section className="rounded-lg border border-success/30 bg-success-soft/40 p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-success">
        Lo que recuperas cada semana
      </p>
      <p className="mt-2 font-serif text-[clamp(2rem,5vw,3rem)] font-normal leading-none tracking-[-0.02em]">
        {spellMinutes(saved.perWeek)}
      </p>
      <p className="mt-3 max-w-[52ch] text-[15px] leading-relaxed text-ink/85">
        Medido por ti en {saved.tasksMeasured}{' '}
        {saved.tasksMeasured === 1 ? 'tarea' : 'tareas'} de tu semana: lo que tardabas antes menos
        lo que tardas ahora. Cada tarea de abajo muestra sus dos números, para que puedas revisar
        la cuenta.
      </p>
    </section>
  );
}

/** Nothing has happened yet. Say what the first session does, not "no data". */
/**
 * The empty notebook, read by somebody who has signed in and not yet spoken.
 *
 * It described the order this product had before it was rebuilt: ask four
 * questions, show the map, build the plan, and reach the learner's own tasks
 * "desde la segunda sesión". That is the ordering the README has a section
 * explaining was a vitamin, and the one the hero, the persona, the topic buttons
 * and the opening line were all moved off. This was the fourth place still
 * telling people the old story, and the one they read while deciding whether to
 * press start.
 *
 * It also said the class can be done walking. The first one cannot, for the
 * reason the landing page now gives: it ends with a task actually done, and that
 * needs a screen.
 */
function FirstVisit() {
  return (
    <section className="rounded-lg border border-line bg-surface-alt/50 p-6">
      <h2 className="font-serif text-[22px] font-normal leading-snug">
        Todavía no hay nada acá, y eso es normal.
      </h2>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">
        Esta página se llena en tu primera clase. El profesor te pregunta a qué te dedicas y en
        qué se te va la semana, eligen juntos la tarea que más te pesa, y la resuelven ahí mismo
        con tus propias cosas. Al terminar mides cuánto tardabas y cuánto tardaste: esa resta
        queda acá. El mapa y el plan vienen después, cuando ya viste funcionar algo tuyo.
      </p>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        Son unos 15 minutos hablando. Esta primera vez, mejor frente al computador: la idea es
        que termines con la tarea hecha.
      </p>
    </section>
  );
}

/**
 * The map, as it was given to this person.
 *
 * Not a template: these three strings came out of their own diagnostic. That is
 * why the page shows them at all rather than re-describing the product, and why
 * a missing part is left out instead of filled with generic copy.
 */
function Mapa({ profile }: { profile: CareerProfile }) {
  const who = [profile.role, profile.field, profile.sector].filter(Boolean).join(' · ');
  const parts = [
    { label: 'Dónde gana valor lo que ya sabes', body: profile.map.value },
    { label: 'Qué herramientas existen para lo tuyo', body: profile.map.categories },
    { label: 'Los 3 caminos', body: profile.map.paths },
  ].filter((p) => Boolean(p.body));

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-serif text-[26px] font-normal leading-snug tracking-[-0.01em]">
          El mapa
        </h2>
        {who && <p className="text-[14px] text-muted">{who}</p>}
      </div>

      {profile.weeklyTasks.length > 0 && (
        <div className="rounded-lg border border-line bg-surface p-5 shadow-sm">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-soft">
            Tus tareas de la semana
          </h3>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {profile.weeklyTasks.map((task) => (
              <li key={task} className="flex items-start gap-2.5 text-[15px] leading-relaxed">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                {task}
              </li>
            ))}
          </ul>
        </div>
      )}

      {parts.length > 0 && (
        <div className="space-y-4">
          {parts.map((part) => (
            <div key={part.label} className="rounded-lg border border-line bg-surface p-5 shadow-sm">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-soft">
                {part.label}
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink/90">{part.body}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {(Object.keys(PATHS) as PathId[]).map((id) => {
          const chosen = profile.chosenPath === id;
          return (
            <div
              key={id}
              className={`rounded-lg border p-4 ${
                chosen
                  ? 'border-accent/45 bg-accent-soft/30 ring-1 ring-accent/15'
                  : 'border-line bg-surface-alt/40'
              }`}
            >
              {chosen && (
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">
                  Tu camino
                </span>
              )}
              <h3
                className={`text-[15px] font-semibold leading-snug ${chosen ? 'mt-1.5' : ''} ${
                  chosen ? 'text-ink' : 'text-muted'
                }`}
              >
                {PATHS[id].title}
              </h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{PATHS[id].body}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * A profile with no plan.
 *
 * This is a real state, not an error: the diagnostic ran out of minutes before
 * the weekly tasks, and there is no applied level without them. Say which piece
 * is missing rather than showing an empty plan.
 */
function PlanPending({ profile }: { profile: CareerProfile }) {
  const missing = profile.weeklyTasks.length === 0 ? 'tus tareas de la semana' : 'tu camino';
  return (
    <section className="rounded-lg border border-warning/25 bg-warning-soft/50 p-5">
      <h2 className="text-[15px] font-semibold text-warning">Tu plan está a medio armar.</h2>
      <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-ink/85">
        Falta {missing}. Retoma la clase y termina el diagnóstico: son un par de preguntas y
        el plan queda armado acá mismo.
      </p>
    </section>
  );
}

/** Steps grouped by level, in curriculum order, with the current one marked. */
function Plan({ steps, currentId }: { steps: PlanStep[]; currentId: string | null }) {
  const done = steps.filter((s) => s.status === 'done').length;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-serif text-[26px] font-normal leading-snug tracking-[-0.01em]">
          Tu plan
        </h2>
        <p className="text-[14px] text-muted">
          {done} de {steps.length} pasos hechos
        </p>
      </div>

      {/* One bar, not a percentage badge: the shape of the plan is the point. */}
      <div
        aria-hidden
        className="flex h-1.5 gap-px overflow-hidden rounded-full bg-surface-alt"
      >
        {steps.map((step) => (
          <span
            key={step.id}
            className={`flex-1 ${
              step.status === 'done'
                ? 'bg-success'
                : step.id === currentId
                  ? 'bg-accent'
                  : 'bg-line'
            }`}
          />
        ))}
      </div>

      <div className="space-y-6">
        {LEVELS.map((level) => {
          const own = steps.filter((s) => s.level === level.id);
          if (own.length === 0) return null;

          return (
            <div key={level.id}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-accent">
                  Nivel {level.number}
                </h3>
                <p className="text-[17px] font-semibold tracking-tight">{level.title}</p>
              </div>
              <p className="mt-1 text-[14px] leading-relaxed text-muted">{level.purpose}</p>

              <ol className="mt-3 space-y-2.5">
                {own.map((step) => (
                  <li key={step.id}>
                    <Step step={step} isCurrent={step.id === currentId} level={level.id} />
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const STATUS_LABEL: Record<PlanStep['status'], string> = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  done: 'Hecho',
};

function Step({
  step,
  isCurrent,
  level,
}: {
  step: PlanStep;
  isCurrent: boolean;
  level: LevelId;
}) {
  const detail = stepDetail(step);

  return (
    <article
      className={`rounded-lg border bg-surface p-4 shadow-sm sm:p-5 ${
        isCurrent ? 'border-accent/45 ring-1 ring-accent/15' : 'border-line'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
        <div className="min-w-0">
          {isCurrent && (
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">
              Vas acá
            </span>
          )}
          <h4 className={`text-[16px] font-semibold leading-snug ${isCurrent ? 'mt-1' : ''}`}>
            {step.title}
          </h4>
          {detail && (
            <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{detail.objective}</p>
          )}
        </div>

        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] ${
            step.status === 'done'
              ? 'border-success/25 bg-success-soft/70 text-success'
              : step.status === 'in_progress'
                ? 'border-gold/40 bg-gold-soft/50 text-warning'
                : 'border-line bg-surface-alt text-soft'
          }`}
        >
          {STATUS_LABEL[step.status]}
        </span>
      </div>

      {detail && (
        <p className="mt-3 text-[13px] leading-relaxed text-soft">
          <span className="font-semibold text-muted">La prueba:</span> {detail.proof}
        </p>
      )}

      {/*
        The two numbers, shown on the step they came from. This is what makes the
        headline auditable: the learner can see which task contributed what, and
        correct the teacher next session if a number is wrong.
      */}
      {step.minutesBefore !== null && step.minutesAfter !== null && (
        <p className="mt-3 inline-flex flex-wrap items-baseline gap-x-2 rounded-md bg-success-soft/50 px-3 py-2 text-[14px] text-ink/85">
          <span className="text-soft line-through">{step.minutesBefore} min</span>
          <span aria-hidden className="text-soft">
            →
          </span>
          <span className="font-semibold">{step.minutesAfter} min</span>
          {step.minutesBefore > step.minutesAfter && (
            <span className="text-success">
              ahorras {step.minutesBefore - step.minutesAfter} min cada semana
            </span>
          )}
        </p>
      )}

      {step.commitment && (
        <p className="mt-3 rounded-md border border-gold/30 bg-gold-soft/30 px-3.5 py-2.5 text-[14px] leading-relaxed text-ink/85">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-warning">
            Te comprometiste a
          </span>
          <br />
          {step.commitment}
        </p>
      )}

      {/*
        The evidence box is on every step, open by default, and pre-filled with
        whatever the transcript captured. Progress is only real if the artifact
        exists, so the place to describe it should never be a click away.
      */}
      <form action={saveEvidence} className="mt-4">
        <input type="hidden" name="stepId" value={step.id} />
        <label
          className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-soft"
          htmlFor={`evidence-${step.id}`}
        >
          {level === 'portafolio' ? 'Tu portafolio' : 'Qué construiste'}
        </label>
        <textarea
          id={`evidence-${step.id}`}
          name="evidence"
          rows={2}
          defaultValue={step.evidence ?? ''}
          placeholder="Describe lo que hiciste y qué tuviste que corregir a mano."
          className="mt-1.5 w-full rounded-md border border-field bg-surface px-3.5 py-2.5 text-[14px] leading-relaxed text-ink transition-colors duration-150 ease-out placeholder:text-muted hover:border-line-strong focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft"
        />
        <button className="mt-2 rounded-md border border-line bg-surface px-4 py-2 text-[13px] font-semibold text-ink shadow-sm transition duration-150 ease-out hover:border-line-strong hover:shadow-md">
          Guardar
        </button>
      </form>
    </article>
  );
}

/** What happened, session by session, newest first. */
function Historial({ history }: { history: SessionRecord[] }) {
  return (
    <section className="space-y-5">
      <h2 className="font-serif text-[26px] font-normal leading-snug tracking-[-0.01em]">
        Tus sesiones
      </h2>

      <ul className="space-y-3">
        {history.map((session) => (
          <li
            key={session.id}
            className="rounded-lg border border-line bg-surface p-4 shadow-sm sm:p-5"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-soft">
              {new Date(session.createdAt).toLocaleDateString('es-CL', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
            {session.taught && (
              <p className="mt-1.5 text-[15px] font-medium leading-snug">{session.taught}</p>
            )}

            {session.commitment && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 rounded-md bg-surface-alt/60 px-3.5 py-3">
                <p className="min-w-0 text-[14px] leading-relaxed text-ink/85">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-soft">
                    Compromiso
                  </span>
                  <br />
                  {session.commitment}
                </p>

                {session.commitmentDone === null ? (
                  <div className="flex shrink-0 gap-2">
                    <DoneButton sessionId={session.id} done label="Lo hice" />
                    <DoneButton sessionId={session.id} done={false} label="No lo hice" />
                  </div>
                ) : (
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] ${
                      session.commitmentDone
                        ? 'border-success/25 bg-success-soft/70 text-success'
                        : 'border-line bg-surface text-muted'
                    }`}
                  >
                    {session.commitmentDone ? 'Cumplido' : 'Sin hacer'}
                  </span>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function DoneButton({
  sessionId,
  done,
  label,
}: {
  sessionId: string;
  done: boolean;
  label: string;
}) {
  return (
    <form action={setCommitmentDone}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="done" value={String(done)} />
      <button
        className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition duration-150 ease-out hover:shadow-sm ${
          done
            ? 'border-success/30 bg-success-soft/50 text-success hover:border-success/60'
            : 'border-line bg-surface text-muted hover:border-line-strong'
        }`}
      >
        {label}
      </button>
    </form>
  );
}
