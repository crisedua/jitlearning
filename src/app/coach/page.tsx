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
          Te pregunta qué haces, te muestra qué es posible para alguien con tu experiencia y
          te enseña paso a paso con tus propias tareas. Puedes escucharlo caminando.
        </p>

        {/*
          The notebook, linked from the classroom. Everything worth keeping lives
          there: the map, the plan and the evidence. A voice session cannot show
          a plan of 11 steps, so it has to be one click away at all times.
        */}
        <Link
          href="/progreso"
          className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-medium text-accent transition-colors duration-150 ease-out hover:text-accent-hover"
        >
          Ver tu mapa y tu plan
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
        <VoiceTutor />
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
