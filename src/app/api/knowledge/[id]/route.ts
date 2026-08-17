/** Per-document operations: index status, retry indexing, delete. */
import { NextResponse } from 'next/server';
import { indexStatus, purge, reindex } from '@/lib/knowledge';
import { syncAgentKnowledge } from '@/lib/agent';
import { requireSecret, UnauthorizedError } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

function errorResponse(err: unknown) {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  return NextResponse.json(
    { error: err instanceof Error ? err.message : 'Unexpected error' },
    { status: 500 },
  );
}

/** Poll target while a document is indexing. */
export async function GET(req: Request, { params }: Params) {
  try {
    requireSecret(req);
    const { id } = await params;
    return NextResponse.json(await indexStatus(id));
  } catch (err) {
    return errorResponse(err);
  }
}

/** Retry a failed index. */
export async function POST(req: Request, { params }: Params) {
  try {
    requireSecret(req);
    const { id } = await params;
    return NextResponse.json({ status: await reindex(id) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    requireSecret(req);
    const { id } = await params;
    await purge(id);

    // Deleting with force detaches it agent-side too, but re-syncing keeps each
    // agent's list from drifting if anything else changed meanwhile. Every
    // coach, because a deleted document may have been attached to several.
    let syncError: string | undefined;
    try {
      await syncAgentKnowledge();
    } catch (err) {
      syncError = err instanceof Error ? err.message : 'Sync failed';
    }

    return NextResponse.json({ deleted: id, syncError });
  } catch (err) {
    return errorResponse(err);
  }
}
