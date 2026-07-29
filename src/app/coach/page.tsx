import Link from 'next/link';
import { VoiceTutor } from '@/components/VoiceTutor';
import { agentId } from '@/lib/config';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Coach de aprendizaje · Aprendizaje JIT',
};

export default function CoachPage() {
  // Only the agent id is read here — the document list is behind the ingest
  // secret, so this public page must not try to fetch it.
  const configured = Boolean(agentId());

  return (
    <div className="mx-auto max-w-[96rem] space-y-8 px-6 py-10">
      <header>
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
