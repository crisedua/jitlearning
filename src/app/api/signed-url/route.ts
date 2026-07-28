/**
 * Mints a short-lived signed URL so the browser can open a WebSocket to the
 * agent without ever seeing the ElevenLabs API key.
 *
 * Deliberately NOT behind the ingest secret — the learner-facing coach page
 * needs it, and a browser cannot hold a shared secret. It is the one open
 * endpoint, so anyone with the URL can start a (billable) conversation. Put a
 * real session check here before this reaches an audience you don't control.
 */
import { NextResponse } from 'next/server';
import { getSignedUrl } from '@/lib/elevenlabs';
import { agentId } from '@/lib/config';

export const runtime = 'nodejs';
// The URL is short-lived; caching it would hand stale credentials to new sessions.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const id = agentId();
    if (!id) {
      return NextResponse.json(
        { error: 'ELEVENLABS_AGENT_ID is not configured.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ signedUrl: await getSignedUrl(id), agentId: id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not get signed URL' },
      { status: 500 },
    );
  }
}
