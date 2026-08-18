/**
 * The funnel: what people actually did.
 *
 * The one question this product cannot answer from its own code is whether
 * anybody will pay for it, and until now there was no instrument to find out. The
 * cost dashboard says what running it costs; nothing said what it produced.
 *
 * Six numbers, each one a step somebody either took or did not:
 *
 *   signed up          created a profile
 *   talked             held at least one conversation
 *   finished a task    has a level 1 step marked done
 *   measured           that step carries both minutes
 *   still coming back  talked in more than one calendar day
 *   paying             on a plan that costs money
 *
 * The drop between any two of them is worth more than any opinion about the
 * product, including mine. If people talk and never finish a task, the session is
 * too long or the teacher is not closing. If they finish and never measure, the
 * subtraction is not happening and the value claim has no evidence behind it. If
 * they measure and never pay, the offer is wrong or the price is.
 *
 * Not linked from anywhere, gated on identity, `noindex`. The gate is the
 * protection, not the obscurity.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { checkAdmin } from '@/lib/admin';
import { signInPath } from '@/lib/paths';
import { NotAdmin } from '@/components/NotAdmin';
import { serviceConfigured, supabaseAdmin } from '@/lib/supabase/admin';
import { classReport } from '@/lib/classes';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Embudo · ModoJIT',
  robots: { index: false, follow: false },
};

/** One page load's worth of rows. Past this the numbers are a floor, and say so. */
const MAX_ROWS = 5_000;

interface Funnel {
  signedUp: number;
  talked: number;
  finishedTask: number;
  measured: number;
  returned: number;
  /**
   * Clicks on a buy button, and how many came from somebody signed in.
   * `null` when the migration has not been applied, which must not read as zero:
   * see the same distinction made for `minutesUnavailable`.
   */
  intents: { total: number; identified: number } | null;
  paying: number;
  /** Total weekly minutes recovered across every learner who measured one. */
  minutesRecovered: number;
  capped: boolean;
  /** True when plan_steps has no minute columns, so "measured" cannot be counted. */
  minutesUnavailable: boolean;
}

async function loadFunnel(): Promise<Funnel | null> {
  if (!serviceConfigured()) return null;
  const db = supabaseAdmin();

  const [profiles, sessions, steps, intents] = await Promise.all([
    db.from('profiles').select('id, plan_id').limit(MAX_ROWS),
    db.from('coach_sessions').select('user_id, started_at').limit(MAX_ROWS),
    /*
     * The minute columns are three migrations newer than plan_steps, and this
     * select is all-or-nothing: without them the read fails with 42703 and the
     * handler below turns that into an empty array.
     *
     * Empty here does not read as "unknown", it reads as zero. This page would
     * have reported that nobody finished a task and nobody measured anything —
     * two of its six numbers, flatly wrong, on the instrument built to answer
     * the one question this repository cannot answer about itself. An operator
     * would conclude the product does not work and be looking at a missing
     * migration.
     *
     * So it retries without them. Four of the six numbers do not depend on
     * minutes at all, and a page that says "measured: unavailable" is honest in
     * a way that "measured: 0" is not.
     */
    db
      .from('plan_steps')
      .select('user_id, level, status, minutes_before, minutes_after')
      .limit(MAX_ROWS),
    /*
     * The step the funnel used to stop one short of. Its table is the newest
     * migration, so an operator who has not pasted it gets "sin datos" rather
     * than a zero that would read as "nobody wanted to buy" — the single
     * costliest wrong number this page could show.
     */
    db.from('purchase_intents').select('user_id').limit(MAX_ROWS),
  ]);

  if (profiles.error) return null;

  const people = (profiles.data ?? []) as Array<{ id: string; plan_id: string }>;
  const rows = (sessions.data ?? []) as Array<{ user_id: string; started_at: string }>;

  /*
   * "Came back" is measured in calendar days, not sessions. Two conversations in
   * one sitting is one visit; the thing worth counting is somebody choosing to
   * return on a different day, which is the only honest signal of a habit.
   */
  const daysByUser = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.user_id) continue;
    const day = new Date(r.started_at).toISOString().slice(0, 10);
    const set = daysByUser.get(r.user_id) ?? new Set<string>();
    set.add(day);
    daysByUser.set(r.user_id, set);
  }

  let stepRows: Record<string, unknown>[] | null = steps.error
    ? null
    : ((steps.data ?? []) as unknown as Record<string, unknown>[]);
  let minutesUnavailable = false;

  if (steps.error?.code === '42703') {
    const retry = await db
      .from('plan_steps')
      .select('user_id, level, status')
      .limit(MAX_ROWS);
    if (!retry.error) {
      stepRows = (retry.data ?? []) as unknown as Record<string, unknown>[];
      minutesUnavailable = true;
    }
  }

  const planSteps = (stepRows ?? []) as unknown as Array<{
    user_id: string;
    level: string;
    status: string;
    minutes_before: number | null;
    minutes_after: number | null;
  }>;

  const finished = new Set<string>();
  const measured = new Set<string>();
  let minutesRecovered = 0;

  for (const s of planSteps) {
    if (s.level !== 'semana' || s.status !== 'done') continue;
    finished.add(s.user_id);
    if (s.minutes_before === null || s.minutes_after === null) continue;
    measured.add(s.user_id);
    minutesRecovered += Math.max(s.minutes_before - s.minutes_after, 0);
  }

  const intentRows = intents.error
    ? null
    : ((intents.data ?? []) as Array<{ user_id: string | null }>);

  return {
    signedUp: people.length,
    talked: daysByUser.size,
    finishedTask: finished.size,
    measured: measured.size,
    returned: [...daysByUser.values()].filter((days) => days.size > 1).length,
    intents: intentRows
      ? {
          total: intentRows.length,
          identified: new Set(intentRows.filter((r) => r.user_id).map((r) => r.user_id)).size,
        }
      : null,
    paying: people.filter((p) => p.plan_id !== 'free').length,
    minutesRecovered,
    capped: people.length >= MAX_ROWS || rows.length >= MAX_ROWS,
    minutesUnavailable,
  };
}

export default async function EmbudoPage() {
  const gate = await checkAdmin();
  if (!gate.ok) {
    if (gate.reason === 'anonymous') redirect(signInPath('/admin/embudo'));
    // Signed in as somebody else. Say so rather than bouncing them to the
    // marketing page, which is indistinguishable from the page being broken.
    return <NotAdmin email={gate.email} path="/admin/embudo" />;
  }

  // Read together: one needs our database, the other needs none of it, and the
  // page is most useful in the window where only the second can answer.
  const [funnel, classes] = await Promise.all([loadFunnel(), classReport()]);

  return (
    <section className="mx-auto max-w-[70rem] px-6 py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Operación</p>
      <h1 className="mt-4 max-w-[22ch] font-serif text-[clamp(2rem,4.5vw,3rem)] font-normal leading-[1.06] tracking-[-0.02em]">
        Qué hizo la gente
      </h1>
      <p className="mt-5 max-w-[62ch] text-[17px] leading-relaxed text-muted">
        Seis pasos. Lo que importa no es ningún número por separado, sino dónde se cae la gente
        entre uno y el siguiente: ahí está lo que hay que arreglar, y no en una opinión sobre el
        producto.
      </p>

      {/*
        What the classes say, before this app has recorded anything.
        
        Everything below counts rows we wrote, and we write nothing until the
        post-call webhook is registered. Until then the funnel answers zero to
        every question while real conversations are happening, and zero reads as
        broken rather than as unwired. This panel comes from ElevenLabs, so it
        can answer on day one, and it says the narrower thing it actually knows:
        whether the classes that happened did what a class is meant to do.
      */}
      {classes && classes.held > 0 && (
        <section className="mt-10 rounded-lg border border-line bg-surface-alt/40 px-5 py-4">
          <h2 className="text-[15px] font-semibold">Lo que dicen las clases</h2>
          <p className="mt-1.5 text-[15px] leading-relaxed text-ink/85">
            {classes.held} conversación(es) de más de un minuto.{' '}
            {classes.analysed === 0 && 'Ninguna de las recientes trae análisis todavía.'}
            {classes.analysed > 0 &&
              (classes.measurable === 0
                ? 'A ninguna de las recientes se le pidieron los dos números todavía, así que no dicen si la clase funciona.'
                : `De las ${classes.measurable} a las que sí se les pidió, ${classes.measured} dejó los dos números.`)}
          </p>
          {/*
            Graded and ungraded are different answers.
            
            The success criteria are newer than every conversation on the agent,
            so counting an ungraded one as "did not finish a task" would report a
            failure where nobody had asked the question. The first version of
            this panel did exactly that, one paragraph after warning that zero
            reads as broken.
          */}
          <p className="mt-1 text-[14px] leading-relaxed text-muted">
            {classes.graded === 0
              ? 'Todavía ninguna clase viene calificada: los criterios son más nuevos que todas ellas.'
              : `${classes.finished} de ${classes.graded} calificada(s) terminó una tarea real.`}
          </p>
          {classes.measurable > 0 && classes.measured === 0 && (
            <p className="mt-2 text-[14px] leading-relaxed text-warning">
              Sin los dos números nadie ve la oferta en su progreso, así que a nadie se le pide
              pagar.
            </p>
          )}
          {classes.whyNot && (
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              El extractor dijo: {classes.whyNot}
            </p>
          )}
          {classes.personaChangedSince && (
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              La persona del profesor cambió después de la última clase, así que esto describe a un
              profesor que ya no existe.
            </p>
          )}
        </section>
      )}

      {!funnel ? (
        <p className="mt-10 rounded-lg border border-warning/35 bg-warning-soft/50 px-4 py-3 text-[15px] leading-relaxed text-ink/80">
          Falta <code className="font-mono text-[13px]">SUPABASE_SERVICE_ROLE_KEY</code>, así que no
          hay nada que leer.
        </p>
      ) : (
        <>
          <ol className="mt-10 space-y-2">
            <Step label="Se registró" value={funnel.signedUp} of={funnel.signedUp} />
            <Step label="Habló al menos una vez" value={funnel.talked} of={funnel.signedUp} />
            <Step
              label="Terminó una tarea de su semana"
              value={funnel.finishedTask}
              of={funnel.signedUp}
              note="El momento en que el producto cumple lo que promete."
            />
            {funnel.minutesUnavailable ? (
              <li className="rounded-lg border border-warning/35 bg-warning-soft/50 px-5 py-4">
                <p className="text-[15px] font-medium">Midió lo que ahorra</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink/80">
                  No se puede contar: falta la migración{' '}
                  <code className="font-mono text-[12px]">20260812000000_hours_saved.sql</code>. Sin
                  esas dos columnas nadie puede medir nada, así que este paso no es cero, es
                  desconocido.
                </p>
              </li>
            ) : (
              <Step
                label="Midió lo que ahorra"
                value={funnel.measured}
                of={funnel.signedUp}
                note="Sin este número no hay argumento de venta."
              />
            )}
            <Step label="Volvió otro día" value={funnel.returned} of={funnel.signedUp} />
            {funnel.intents === null ? (
              <li className="rounded-lg border border-warning/35 bg-warning-soft/50 px-5 py-4">
                <p className="text-[15px] font-medium">Dijo que quiere pagar</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink/80">
                  No se puede contar: falta la migración{' '}
                  <code className="font-mono text-[12px]">
                    20260817000000_purchase_intent.sql
                  </code>
                  . Esto no es cero, es desconocido, y es el paso que más caro sale confundir.
                </p>
              </li>
            ) : (
              <Step
                label="Dijo que quiere pagar"
                value={funnel.intents.total}
                of={funnel.signedUp}
                note={
                  funnel.intents.identified > 0
                    ? `${funnel.intents.identified} con cuenta, así que a esos les puedes escribir.`
                    : 'Apretó el botón de contratar. Todavía no es una venta, pero es la intención.'
                }
              />
            )}
            <Step
              label="Está pagando"
              value={funnel.paying}
              of={funnel.signedUp}
              note="La única respuesta que zanja si esto se vende."
            />
          </ol>

          {funnel.measured > 0 && (
            <p className="mt-8 rounded-lg border border-success/30 bg-success-soft/40 px-5 py-4 text-[15px] leading-relaxed text-ink/85">
              Entre todos recuperaron{' '}
              <span className="font-semibold">
                {Math.round(funnel.minutesRecovered / 60)} horas
              </span>{' '}
              a la semana, medidas por ellos. Es la cifra que puedes citar, porque no la pusiste tú.
            </p>
          )}

          {funnel.measured > 0 && funnel.paying === 0 && (
            <p className="mt-4 max-w-[70ch] rounded-lg border border-warning/35 bg-warning-soft/50 px-5 py-4 text-[15px] leading-relaxed text-ink/80">
              Hay gente que midió lo que ahorra y nadie ha pagado todavía. Si eso se sostiene con
              diez personas, el problema no es el producto: es el precio, la oferta, o que nunca se
              les pidió. Pregúntaselo a una de ellas antes de cambiar nada.
            </p>
          )}

          {funnel.capped && (
            <p className="mt-4 text-[13px] leading-relaxed text-soft">
              Se leyeron {MAX_ROWS.toLocaleString('es-CL')} filas como máximo: estos números son un
              piso, no el total.
            </p>
          )}
        </>
      )}

      <p className="mt-14 max-w-[75ch] border-t border-line pt-6 text-[13px] leading-relaxed text-soft">
        Lo que cuesta atender a esta gente está en{' '}
        <Link href="/admin/costos" className="text-accent underline underline-offset-2">
          /admin/costos
        </Link>
        , junto con los minutos que cubre cada plan.
      </p>
    </section>
  );
}

/** One step, with the share of signups that reached it. */
function Step({
  label,
  value,
  of,
  note,
}: {
  label: string;
  value: number;
  of: number;
  note?: string;
}) {
  const share = of > 0 ? Math.round((value / of) * 100) : 0;

  return (
    <li className="rounded-lg border border-line bg-surface px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-[15px] font-medium">{label}</span>
        <span className="flex items-baseline gap-2">
          <span className="font-mono text-[22px] leading-none">{value}</span>
          <span className="text-[13px] text-soft">{share}%</span>
        </span>
      </div>
      {/* The bar is the point: a column of numbers hides the drop between two rows. */}
      <div aria-hidden className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-alt">
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${Math.max(share, value > 0 ? 2 : 0)}%` }}
        />
      </div>
      {note && <p className="mt-2 text-[13px] leading-relaxed text-muted">{note}</p>}
    </li>
  );
}
