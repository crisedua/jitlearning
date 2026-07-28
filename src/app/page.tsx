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
        <div className="rounded-lg border border-amber-900 bg-amber-950/40 p-5 text-sm">
          <p className="font-medium text-amber-300">No coach configured yet.</p>
          <p className="mt-1 text-amber-200/80">
            Run <code className="text-amber-300">npm run setup:agent</code> and set the
            printed <code className="text-amber-300">ELEVENLABS_AGENT_ID</code> in your
            environment. Then add material under{' '}
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
