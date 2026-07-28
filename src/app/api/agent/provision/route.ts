/**
 * Create the tutor agent from the deployed app.
 *
 * This exists so you never need the ElevenLabs key on your own machine: the
 * key lives in Vercel's environment, and this endpoint runs there. It is the
 * hosted equivalent of `npm run setup:agent`.
 *
 *   curl -X POST https://<app>.vercel.app/api/agent/provision \
 *     -H "x-ingest-secret: $INGEST_SECRET"
 *
 * Returns the new agent id, which you then set as ELEVENLABS_AGENT_ID in the
 * Vercel project settings and redeploy. Nothing is persisted here — an agent
 * id written to a serverless filesystem would not survive the request.
 */
import { NextResponse } from 'next/server';
import { provisionAgent } from '@/lib/agent';
import { agentId } from '@/lib/config';
import { requireSecret, UnauthorizedError } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    requireSecret(req);

    // Guard against accumulating orphaned agents if this gets called twice.
    // Deliberately opt-in rather than silently creating a second one.
    const existing = agentId();
    const force = new URL(req.url).searchParams.get('force') === 'true';
    if (existing && !force) {
      return NextResponse.json({
        agentId: existing,
        created: false,
        message:
          'ELEVENLABS_AGENT_ID is already set. Append ?force=true to create an additional agent.',
      });
    }

    const id = await provisionAgent();

    return NextResponse.json(
      {
        agentId: id,
        created: true,
        nextSteps: [
          `Set ELEVENLABS_AGENT_ID=${id} in your Vercel project environment variables.`,
          'Redeploy so the new variable is picked up.',
          'Then POST /api/knowledge to add documents.',
        ],
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Provisioning failed' },
      { status: 500 },
    );
  }
}
