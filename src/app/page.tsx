import Link from 'next/link';
import { VoiceTutor } from '@/components/VoiceTutor';
import { agentId } from '@/lib/config';

export const dynamic = 'force-dynamic';

export default function CoachPage() {
  // Only the agent id is read here — the document list is behind the ingest
  // secret, so this public page must not try to fetch it.
  const configured = Boolean(agentId());

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Coach de aprendizaje</h1>
        <p className="mt-1 text-sm text-gray-400">
          Pregunta por lo que te está bloqueando ahora mismo. Las respuestas se basan en
          el material de la base de conocimiento.
        </p>
      </div>

      {configured ? (
        <VoiceTutor />
      ) : (
        <div className="space-y-4 rounded-lg border border-amber-900 bg-amber-950/40 p-5 text-sm">
          <div>
            <p className="font-medium text-amber-300">Todavía no hay coach configurado.</p>
            <p className="mt-1 text-amber-200/80">
              <code className="text-amber-300">ELEVENLABS_AGENT_ID</code> no está definida en
              este entorno. Si ya creaste un agente, solo tienes que añadir la variable y
              volver a desplegar.
            </p>
          </div>

          <div>
            <p className="font-medium text-amber-200/90">Crear uno desde este despliegue</p>
            <pre className="mt-1.5 overflow-x-auto rounded bg-black/40 p-3 text-xs text-amber-100/90">
              {`curl -X POST /api/agent/provision \\
  -H "x-ingest-secret: $INGEST_SECRET"`}
            </pre>
            <p className="mt-1.5 text-xs text-amber-200/70">
              Usa el id devuelto como <code>ELEVENLABS_AGENT_ID</code> y vuelve a desplegar.
              En local, <code>npm run setup:agent</code> hace lo mismo.
            </p>
          </div>

          <p className="text-xs text-amber-200/70">
            Revisa qué más falta en <code>/api/health</code> y luego añade material en{' '}
            <Link href="/knowledge" className="underline">
              Conocimiento
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}
