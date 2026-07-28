/** Agent status and knowledge sync. */
import { NextResponse } from 'next/server';
import { currentAgent, syncAgentKnowledge } from '@/lib/agent';
import { agentId } from '@/lib/config';
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

export async function GET(req: Request) {
  try {
    requireSecret(req);
    const id = agentId();
    if (!id) return NextResponse.json({ agentId: null, configured: false });

    const agent = await currentAgent();
    const prompt = agent?.conversation_config?.agent?.prompt;
    return NextResponse.json({
      agentId: id,
      configured: true,
      attachedDocuments: prompt?.knowledge_base?.length ?? 0,
      ragEnabled: prompt?.rag?.enabled ?? false,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Re-attach every usable document to the agent. Call this after indexing
 * finishes, or any time the agent's view has drifted from the knowledge base.
 */
export async function POST(req: Request) {
  try {
    requireSecret(req);
    return NextResponse.json(await syncAgentKnowledge());
  } catch (err) {
    return errorResponse(err);
  }
}
