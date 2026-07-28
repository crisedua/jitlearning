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
        <h1 className="text-2xl font-semibold tracking-tight">Learning coach</h1>
        <p className="mt-1 text-sm text-gray-400">
          Ask about what is blocking you right now. Answers are grounded in the material
          uploaded to the knowledge base.
        </p>
      </div>

      {configured ? (
        <VoiceTutor />
      ) : (
        <div className="space-y-4 rounded-lg border border-amber-900 bg-amber-950/40 p-5 text-sm">
          <div>
            <p className="font-medium text-amber-300">No coach configured yet.</p>
            <p className="mt-1 text-amber-200/80">
              <code className="text-amber-300">ELEVENLABS_AGENT_ID</code> is not set in
              this environment. If you already created an agent, you only need to add the
              variable and redeploy.
            </p>
          </div>

          <div>
            <p className="font-medium text-amber-200/90">Create one from this deployment</p>
            <pre className="mt-1.5 overflow-x-auto rounded bg-black/40 p-3 text-xs text-amber-100/90">
              {`curl -X POST /api/agent/provision \\
  -H "x-ingest-secret: $INGEST_SECRET"`}
            </pre>
            <p className="mt-1.5 text-xs text-amber-200/70">
              Set the returned id as <code>ELEVENLABS_AGENT_ID</code>, then redeploy.
              Locally, <code>npm run setup:agent</code> does the same thing.
            </p>
          </div>

          <p className="text-xs text-amber-200/70">
            Check what else is missing at <code>/api/health</code>, then add material
            under{' '}
            <Link href="/knowledge" className="underline">
              Knowledge
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}
