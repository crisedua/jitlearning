import Link from 'next/link';
import { redirect } from 'next/navigation';
import { VoiceTutor } from '@/components/VoiceTutor';
import { SessionBar } from '@/components/SessionBar';
import { BalanceNote } from '@/components/BalanceNote';
import { OpenCommitment } from '@/components/OpenCommitment';
import { agentId } from '@/lib/config';
import { TEACHER } from '@/lib/teacher';
import { currentUser } from '@/lib/supabase/server';
import { signInPath } from '@/lib/paths';
import { isAdminEmail } from '@/lib/admin';
import { getUsageBalance } from '@/lib/account';
import { openCommitment } from '@/lib/commitments';

/*
 * Always per-request: this page reads the learner's session, their balance and
 * their open commitment.
 */
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Tu clase · ModoJIT',
};

/**
 * The classroom.
 *
 * This used to be a picker, because there used to be several coaches to pick
 * between. There is one teacher now, so the screen that asked which one had
 * nothing left to ask: `/coach` is the session itself. The path is unchanged on
 * purpose, since every link in the app, the pricing page and the sign-in return
 * path already point here.
 */
export default async function CoachPage() {
  /*
   * Sign-in gate, kept at the entrance even though this page mints nothing. The
   * real check is in `/api/signed-url`, which is what creates the billable
   * credential; this one exists so nobody presses the microphone button and only
   * then discovers they are signed out.
   */
  const user = await currentUser();
  if (!user) redirect(signInPath('/coach'));

  // Only the agent id is read here — the document list is behind the ingest
  // secret, so this page must not try to fetch it.
  const configured = Boolean(agentId());
  /*
   * Whether a lookup can actually be served from this deployment.
   *
   * `/api/ask` checks INGEST_SECRET before anything else and returns 503
   * without it, so with that unset nothing can search however the agent is
   * configured. Reading an environment variable rather than fetching the agent,
   * because round 65 removed a second network call from this page for the same
   * reason: it sits immediately before the microphone.
   *
   * The narrower case it does not catch — secret present, tool never attached —
   * is what `npm run doctor` fails on and what `setup:tools` now verifies for
   * itself after pushing.
   */
  const canSearch = Boolean(process.env.INGEST_SECRET?.trim());
  /*
   * Who may be told *why* it is not configured, decided without a second trip.
   *
   * This called `checkAdmin()`, which calls `currentUser()`, which revalidates
   * the token with Supabase over the network — on a page that had already done
   * exactly that four lines above, serially, before anything else could start.
   * A second auth round-trip on the screen immediately before the microphone,
   * and its result thrown away in the normal case, since it only decides what to
   * render when the agent is missing.
   *
   * The user is already in hand and `isAdminEmail` is a pure comparison, so the
   * answer costs nothing.
   */
  const isOperator = isAdminEmail(user.email);
  const [balance, commitment] = await Promise.all([
    getUsageBalance(user.id, user.email),
    openCommitment(user.id),
  ]);

  return (
    <div className="mx-auto max-w-[96rem] space-y-8 px-6 py-10">
      <header>
        <div className="mb-5 flex justify-end">
          <SessionBar />
        </div>

        <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-accent">
          <span aria-hidden className="inline-block h-px w-[34px] bg-gold" />
          Tu clase por voz
        </p>
        <h1 className="mt-3 font-serif text-[clamp(2rem,4.5vw,2.875rem)] font-normal leading-[1.05] tracking-[-0.02em]">
          {TEACHER.label}
        </h1>
        <p className="mt-3 max-w-2xl text-[17px] leading-relaxed text-muted">
          Te pregunta qué haces, eligen la tarea de tu semana que más te pesa y la resuelven
          ahora, con tus propias cosas. Al final mides cuánto tardabas y cuánto tardaste. El
          mapa y el plan vienen después.
        </p>

        {/*
          The notebook, linked from the classroom. Everything worth keeping lives
          there: the map, the plan and the evidence. A voice session cannot show
          a plan of 11 steps, so it has to be one click away at all times.

          The link used to say "ver tu mapa y tu plan", which named two of those
          three and not the one people go looking for. Somebody asked where
          their past classes had been saved while looking at this page — the
          answer was one click away under a label that did not mention them.

          It also now names the destination the way the destination names
          itself. "Tu registro" is the h1 over there; a link that promises a map
          and lands on a register makes somebody check whether they clicked the
          right thing.
        */}
        <Link
          href="/progreso"
          className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-medium text-accent transition-colors duration-150 ease-out hover:text-accent-hover"
        >
          Tu registro: tus clases, tu mapa y tu plan
          <span aria-hidden>→</span>
        </Link>

        {balance && (
          <div>
            <BalanceNote balance={balance} />
          </div>
        )}
      </header>

      {/*
        Above the session, not below it. Someone arriving with an unfinished
        commitment should meet it before they start talking about something new.
      */}
      {commitment && <OpenCommitment commitment={commitment} />}

      {configured ? (
        <VoiceTutor canSearch={canSearch} />
      ) : !isOperator ? (
        /*
         * A learner is not an operator, and this page had them confused.
         *
         * The block below names an environment variable, prints a curl against
         * /api/agent/provision and points at /api/health. It rendered for anybody
         * signed in, so a deployment missing its agent id would hand every person
         * who arrived the shape of its configuration and a set of instructions
         * they cannot act on. Same failure /api/signed-url had, fixed there and
         * left standing here: internal detail is for the function log or for
         * somebody who can do something about it.
         */
        <section className="max-w-2xl rounded-lg border border-warning/25 bg-warning-soft/60 p-5 text-sm">
          <p className="font-semibold text-warning">La clase no está disponible ahora mismo.</p>
          <p className="mt-1 leading-relaxed text-ink/80">
            Estamos arreglándolo. Vuelve a intentarlo en un rato y, si sigue igual, escríbenos y
            lo revisamos.
          </p>
        </section>
      ) : (
        <section className="max-w-2xl space-y-4 rounded-lg border border-warning/25 bg-warning-soft/60 p-5 text-sm">
          <div>
            <p className="font-semibold text-warning">El profesor todavía no está configurado.</p>
            <p className="mt-1 leading-relaxed text-ink/80">
              <code className="rounded-sm bg-surface px-1.5 py-0.5 font-mono text-xs">
                {TEACHER.envKey}
              </code>{' '}
              no está definida en este entorno. Si ya creaste el agente, solo tienes que
              añadir la variable y volver a desplegar.
            </p>
          </div>

          <div>
            <p className="font-medium">Crear uno desde este despliegue</p>
            <pre className="mt-1.5 overflow-x-auto rounded-md border border-line bg-surface px-3 py-2.5 font-mono text-xs leading-relaxed text-ink">
              {`curl -X POST "/api/agent/provision" \\
  -H "x-ingest-secret: $INGEST_SECRET"`}
            </pre>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              Usa el id devuelto como <code className="font-mono">{TEACHER.envKey}</code> y
              vuelve a desplegar. En local,{' '}
              <code className="font-mono">npm run setup:agent</code> hace lo mismo.
            </p>
          </div>

          <p className="text-xs text-muted">
            Revisa qué más falta en <code className="font-mono">/api/health</code> y luego
            añade material en{' '}
            <Link
              href="/knowledge"
              className="rounded-sm font-medium text-accent underline underline-offset-2 hover:text-accent-hover"
            >
              Conocimiento
            </Link>
            .
          </p>
        </section>
      )}
    </div>
  );
}
