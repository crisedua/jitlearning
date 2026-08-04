import Link from 'next/link';
import { redirect } from 'next/navigation';
import { VoiceTutor } from '@/components/VoiceTutor';
import { SessionBar } from '@/components/SessionBar';
import { agentId } from '@/lib/config';
import { currentUser } from '@/lib/supabase/server';
import { signInPath } from '@/lib/paths';
import { getUsageBalance, type UsageBalance } from '@/lib/account';

/**
 * The month's balance, said before the button rather than discovered at it.
 *
 * Renders nothing for unlimited plans and for deployments where the usage view
 * is unavailable — a meter that cannot be read is better absent than wrong.
 * When something has run out it switches to the warning style, and says when
 * it comes back, because "no" without "until when" reads as broken.
 */
function BalanceNote({ balance }: { balance: UsageBalance }) {
  const { minutes, sessions, monthlyMinutes, monthlySessions } = balance;
  if (monthlyMinutes === null && monthlySessions === null) return null;

  const minutesLeft =
    monthlyMinutes === null ? null : Math.max(0, Math.floor(monthlyMinutes - minutes));
  const sessionsLeft =
    monthlySessions === null ? null : Math.max(0, monthlySessions - sessions);
  const exhausted = minutesLeft === 0 || sessionsLeft === 0;

  const parts = [
    minutesLeft !== null && `${minutesLeft} de ${monthlyMinutes} minutos`,
    sessionsLeft !== null && `${sessionsLeft} de ${monthlySessions} conversaciones`,
  ].filter(Boolean);

  return (
    <p
      className={`mt-4 inline-flex items-baseline gap-2 rounded-full border px-3.5 py-1.5 text-[13px] ${
        exhausted
          ? 'border-warning/35 bg-warning-soft/50 text-ink/80'
          : 'border-line bg-surface text-muted'
      }`}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 self-center rounded-full ${exhausted ? 'bg-warning' : 'bg-gold'}`}
      />
      {exhausted
        ? 'Agotaste tu plan de este mes. El contador vuelve a cero el día 1.'
        : `Este mes te quedan ${parts.join(' y ')}.`}
    </p>
  );
}

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Coach de aprendizaje · ModoJIT',
};

export default async function CoachPage() {
  /*
   * Sign-in gate. This page is the entrance to a billable voice session, so it
   * is the first thing checked — before the agent config, before any markup.
   *
   * The check is repeated in `/api/signed-url`, which is what actually mints
   * the credential. Gating only the page would stop nobody: the endpoint is a
   * plain GET that anyone can call directly.
   */
  const user = await currentUser();
  if (!user) redirect(signInPath('/coach'));

  // Only the agent id is read here — the document list is behind the ingest
  // secret, so this page must not try to fetch it.
  const configured = Boolean(agentId());
  const balance = await getUsageBalance(user.id);

  return (
    <div className="mx-auto max-w-[96rem] space-y-8 px-6 py-10">
      <header>
        <div className="mb-5 flex justify-end">
          <SessionBar />
        </div>
        <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-accent">
          <span aria-hidden className="inline-block h-px w-[34px] bg-gold" />
          Aprendizaje justo a tiempo
        </p>
        <h1 className="mt-3 font-serif text-[clamp(2.25rem,5vw,3.25rem)] font-normal leading-[1.05] tracking-[-0.02em]">
          ¿En qué te has atascado?
        </h1>
        <p className="mt-3 max-w-2xl text-[17px] leading-relaxed text-muted">
          Habla con el coach sobre lo que te está bloqueando ahora mismo. Responde apoyándose
          en su base de conocimiento, no en generalidades, y te avisa cuando no tiene material.
        </p>

        {/*
          What changed, said once and in terms of what it lets somebody ask.
          A corpus grows silently: nothing on this page would otherwise tell a
          returning learner that a whole subject arrived since their last visit.
        */}
        <p className="mt-4 inline-flex max-w-2xl flex-wrap items-baseline gap-x-2 rounded-md border border-gold/30 bg-gold-soft/30 px-3.5 py-2.5 text-[14px] leading-relaxed text-ink/85">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-warning">
            Nuevo
          </span>
          <span>
            Implementación de IA en empresas y colegios: por qué fracasa el 95% de los
            pilotos, la Ley 21.719 que rige desde diciembre de 2026, las guías del Mineduc
            y UNESCO, y la evidencia que se contradice.
          </span>
        </p>

        {balance && (
          <div>
            <BalanceNote balance={balance} />
          </div>
        )}
      </header>

      {configured ? (
        <VoiceTutor />
      ) : (
        <section className="max-w-2xl space-y-4 rounded-lg border border-warning/25 bg-warning-soft/60 p-5 text-sm">
          <div>
            <p className="font-semibold text-warning">Todavía no hay coach configurado.</p>
            <p className="mt-1 leading-relaxed text-ink/80">
              <code className="rounded-sm bg-surface px-1.5 py-0.5 font-mono text-xs">
                ELEVENLABS_AGENT_ID
              </code>{' '}
              no está definida en este entorno. Si ya creaste un agente, solo tienes que
              añadir la variable y volver a desplegar.
            </p>
          </div>

          <div>
            <p className="font-medium">Crear uno desde este despliegue</p>
            <pre className="mt-1.5 overflow-x-auto rounded-md border border-line bg-surface px-3 py-2.5 font-mono text-xs leading-relaxed text-ink">
              {`curl -X POST /api/agent/provision \\
  -H "x-ingest-secret: $INGEST_SECRET"`}
            </pre>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              Usa el id devuelto como <code className="font-mono">ELEVENLABS_AGENT_ID</code>{' '}
              y vuelve a desplegar. En local, <code className="font-mono">npm run setup:agent</code>{' '}
              hace lo mismo.
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
