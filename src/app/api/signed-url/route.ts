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
import { TEACHER } from '@/lib/teacher';
import { currentUser } from '@/lib/supabase/server';
import { checkPlanAllowance, startCoachSession } from '@/lib/account';
import { learnerContext } from '@/lib/memory';
import { learnerRecord } from '@/lib/progress';

export const runtime = 'nodejs';
// The URL is short-lived; caching it would hand stale credentials to new sessions.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Inicia sesión con Google para empezar tu clase.' },
        { status: 401 },
      );
    }

    const id = agentId();
    if (!id) {
      return NextResponse.json({ error: `${TEACHER.envKey} is not configured.` }, { status: 409 });
    }

    /*
     * The plan gate, before the credential exists. This is the enforcement the
     * pricing page promises ("se detiene al llegar al límite") — everything
     * billable passes through this mint, so this is the one place a limit
     * means anything.
     */
    const allowance = await checkPlanAllowance(user.id, user.email);
    if (!allowance.allowed) {
      return NextResponse.json({ error: allowance.error }, { status: 403 });
    }

    const signedUrl = await getSignedUrl(id);

    /*
     * Open the usage row *after* the credential exists, so a failed mint does
     * not leave a phantom session in the ledger. `sessionId` comes back null
     * when Supabase is not configured — the coach still works, it just goes
     * unrecorded, which is the right failure for a learner mid-question.
     *
     * The memory lookup rides the same await: it is what turns a returning
     * learner's session into a continuation, and it degrades to null (a cold
     * start) rather than ever failing the mint.
     */
    const [sessionId, context, record] = await Promise.all([
      startCoachSession(user.id, id),
      learnerContext(user.id),
      learnerRecord(user.id),
    ]);

    /*
     * Two kinds of memory, kept apart on purpose.
     *
     * `record` is the structured state the teacher opens on, and it goes in as
     * dynamic variables: substituted into the prompt and the first message before
     * a word is spoken, which is the only way an opening line can name the step
     * and the commitment. `context` is the free-text summary of what was
     * discussed, sent as a contextual update after the socket opens. Merging them
     * would let a rambling summary crowd out the plan.
     */
    return NextResponse.json({
      signedUrl,
      agentId: id,
      sessionId,
      context,
      dynamicVariables: record,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not get signed URL' },
      { status: 500 },
    );
  }
}
