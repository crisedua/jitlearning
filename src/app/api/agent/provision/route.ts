/**
 * Create the tutor agent from the deployed app.
 *
 * This exists so you never need the ElevenLabs key on your own machine: the
 * key lives in Vercel's environment, and this endpoint runs there. It is the
 * hosted equivalent of `npm run setup:agent`.
 *
 *   curl -X POST "https://<app>.vercel.app/api/agent/provision?coach=colegios" \
 *     -H "x-ingest-secret: $INGEST_SECRET"
 *
 * One agent per coach, so `?coach=` is required — there is no sensible default
 * once there is more than one, and guessing would create an agent under the
 * wrong persona that then has to be found and deleted by hand.
 *
 * Returns the new agent id, which you then set as that coach's env var in the
 * Vercel project settings and redeploy. Nothing is persisted here — an agent
 * id written to a serverless filesystem would not survive the request.
 */
import { NextResponse } from 'next/server';
import { provisionAgent } from '@/lib/agent';
import { agentId } from '@/lib/config';
import { availableCoaches, findCoach } from '@/lib/coaches';
import { requireSecret, UnauthorizedError } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    requireSecret(req);

    const params = new URL(req.url).searchParams;
    const coach = findCoach(params.get('coach') ?? undefined);
    if (!coach || !coach.available) {
      return NextResponse.json(
        {
          error: 'Pass ?coach= with one of the available coaches.',
          available: availableCoaches().map((c) => c.id),
        },
        { status: 400 },
      );
    }

    // Guard against accumulating orphaned agents if this gets called twice.
    // Deliberately opt-in rather than silently creating a second one.
    const existing = agentId(coach);
    const force = params.get('force') === 'true';
    if (existing && !force) {
      return NextResponse.json({
        agentId: existing,
        created: false,
        message: `${coach.envKey} is already set. Append &force=true to create an additional agent.`,
      });
    }

    const id = await provisionAgent(coach);

    return NextResponse.json(
      {
        coach: coach.id,
        agentId: id,
        created: true,
        nextSteps: [
          `Set ${coach.envKey}=${id} in your Vercel project environment variables.`,
          'Redeploy so the new variable is picked up.',
          `Then POST /api/agent?coach=${coach.id} to attach its documents.`,
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
