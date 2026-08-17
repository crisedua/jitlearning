/**
 * Knowledge base: list and ingest.
 *
 * This is the endpoint your backend calls to feed the coach:
 *
 *   curl -X POST https://<app>.vercel.app/api/knowledge \
 *     -H "x-ingest-secret: $INGEST_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"url":"https://docs.internal/runbook"}'
 */
import { NextResponse } from 'next/server';
import { ingest } from '@/lib/knowledge';
import { listDocumentViews } from '@/lib/catalog';
import { syncAgentKnowledge } from '@/lib/agent';
import { requireSecret, UnauthorizedError } from '@/lib/auth';
import type { IngestSource } from '@/lib/knowledge';
import type { UsageMode } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Indexing a large file plus the follow-up sync can outlast the default 10s.
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
    return NextResponse.json({ documents: await listDocumentViews() });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Accepts multipart (file upload) or JSON (`url` or `text`). */
export async function POST(req: Request) {
  try {
    requireSecret(req);

    const contentType = req.headers.get('content-type') ?? '';
    let source: IngestSource;
    let name: string | undefined;
    let usageMode: UsageMode = 'auto';

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      if (!(file instanceof File)) {
        return NextResponse.json({ error: 'Expected a `file` field.' }, { status: 400 });
      }
      source = { kind: 'file', file };
      name = (form.get('name') as string) || undefined;
      if (form.get('usageMode') === 'prompt') usageMode = 'prompt';
    } else {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      name = typeof body.name === 'string' ? body.name : undefined;
      if (body.usageMode === 'prompt') usageMode = 'prompt';

      if (typeof body.url === 'string' && body.url.trim()) {
        source = { kind: 'url', url: body.url.trim(), autoSync: body.autoSync === true };
      } else if (typeof body.text === 'string' && body.text.trim()) {
        source = { kind: 'text', text: body.text };
      } else {
        return NextResponse.json(
          { error: 'Provide one of `file`, `url` or `text`.' },
          { status: 400 },
        );
      }
    }

    const document = await ingest(source, { name, usageMode });

    // Pinned docs are usable immediately, so attach them now. Retrieved docs
    // are still indexing and would be attached in an unusable state — the
    // client syncs once indexing reports success.
    let attached = 0;
    let syncError: string | undefined;
    if (usageMode === 'prompt') {
      try {
        const result = await syncAgentKnowledge(new Map([[document.id, usageMode]]));
        attached = result.attached;
      } catch (err) {
        syncError = err instanceof Error ? err.message : 'Sync failed';
      }
    }

    return NextResponse.json({ document, attached, syncError }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
