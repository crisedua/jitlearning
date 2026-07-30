/**
 * Mints a short-lived signed URL so the browser can open a WebSocket to the
 * agent without ever seeing the ElevenLabs API key.
 *
 * Not behind the ingest secret — a browser cannot hold a shared secret. It is
 * behind the learner's Google session instead: this endpoint mints the
 * credential that starts a billable conversation, so an unauthenticated GET
 * here would make the sign-in gate on /coach purely decorative.
 */
import { NextResponse } from 'next/server';
import { getSignedUrl } from '@/lib/elevenlabs';
import { agentId } from '@/lib/config';
import { currentUser } from '@/lib/supabase/server';
import { startCoachSession } from '@/lib/account';

export const runtime = 'nodejs';
// The URL is short-lived; caching it would hand stale credentials to new sessions.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Inicia sesión con Google para hablar con el coach.' },
        { status: 401 },
      );
    }

    const id = agentId();
    if (!id) {
      return NextResponse.json(
        { error: 'ELEVENLABS_AGENT_ID is not configured.' },
        { status: 409 },
      );
    }

    const signedUrl = await getSignedUrl(id);

    /*
     * Open the usage row *after* the credential exists, so a failed mint does
     * not leave a phantom session in the ledger. `sessionId` comes back null
     * when Supabase is not configured — the coach still works, it just goes
     * unrecorded, which is the right failure for a learner mid-question.
     */
    const sessionId = await startCoachSession(user.id, id);

    return NextResponse.json({ signedUrl, agentId: id, sessionId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not get signed URL' },
      { status: 500 },
    );
  }
}
