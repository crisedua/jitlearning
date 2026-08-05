/**
 * Agent status and knowledge sync, per coach.
 *
 * `?coach=<id>` narrows both verbs to one coach; without it, GET reports every
 * available coach and POST syncs all of them. Syncing all is the safe default:
 * a document may belong to several coaches, so a sync scoped to the folder that
 * changed would leave the others carrying a stale attachment list.
 *
 * This GET is also the check that per-coach isolation is real — it returns each
 * agent's attached document names, which is where you can see that the
 * emprendedores agent carries no `empresa-ia/` material.
 */
import { NextResponse } from 'next/server';
import { currentAgent, syncAgentKnowledge } from '@/lib/agent';
import { agentId } from '@/lib/config';
import { availableCoaches, findCoach, type Coach } from '@/lib/coaches';
import { requireSecret, UnauthorizedError } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function errorResponse(err: unknown) {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  return NextResponse.json(
    { error: err instanceof Error ? err.message : 'Unexpected error' },
    { status: 500 },
  );
}

/**
 * Which coaches this request is about: the one named, or all available ones.
 * Returns null for a slug that names nothing, so the caller can 404 rather than
 * silently answering about every coach.
 */
function selection(req: Request): readonly Coach[] | null {
  const slug = new URL(req.url).searchParams.get('coach');
  if (!slug) return availableCoaches();
  const coach = findCoach(slug);
  return coach && coach.available ? [coach] : null;
}

async function statusFor(coach: Coach) {
  const id = agentId(coach);
  if (!id) return { coach: coach.id, agentId: null, configured: false };

  const agent = await currentAgent(coach);
  const prompt = agent?.conversation_config?.agent?.prompt;
  const attached = prompt?.knowledge_base ?? [];

  return {
    coach: coach.id,
    agentId: id,
    configured: true,
    attachedDocuments: attached.length,
    // The names, not just the count: this is how you verify that a coach's
    // corpus contains what it should and nothing else.
    documents: attached.map((d) => d.name).sort(),
    ragEnabled: prompt?.rag?.enabled ?? false,
  };
}

export async function GET(req: Request) {
  try {
    requireSecret(req);
    const coaches = selection(req);
    if (!coaches) return NextResponse.json({ error: 'Unknown coach' }, { status: 404 });

    return NextResponse.json({ coaches: await Promise.all(coaches.map(statusFor)) });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Re-attach every usable document to each agent. Call this after indexing
 * finishes, or any time an agent's view has drifted from the knowledge base.
 */
export async function POST(req: Request) {
  try {
    requireSecret(req);
    const coaches = selection(req);
    if (!coaches) return NextResponse.json({ error: 'Unknown coach' }, { status: 404 });

    const synced = await Promise.all(
      coaches.map(async (coach) => {
        try {
          return { coach: coach.id, ...(await syncAgentKnowledge(coach)) };
        } catch (err) {
          // One unconfigured coach should not fail the sync of the others.
          return {
            coach: coach.id,
            error: err instanceof Error ? err.message : 'Sync failed',
          };
        }
      }),
    );

    return NextResponse.json({ synced });
  } catch (err) {
    return errorResponse(err);
  }
}
