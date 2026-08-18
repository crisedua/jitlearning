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
import { checkPlanAllowance, getUsageBalance, startCoachSession } from '@/lib/account';
import { learnerContext } from '@/lib/memory';
import { learnerRecord } from '@/lib/progress';

/**
 * What a learner is told when the class cannot start.
 *
 * One sentence, in Spanish, that says the situation and what to do, and names
 * nothing internal. Every failure in this route that is not the plan gate
 * resolves to this, because from the learner's side they are the same event:
 * they pressed the button and there is no class right now.
 */
const NOT_AVAILABLE =
  'El profesor no está disponible en este momento. Vuelve a intentarlo en un rato: si sigue igual, escríbenos y lo revisamos.';

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
      /*
       * Configuration, said as a sentence rather than as a variable name.
       *
       * This used to answer `ELEVENLABS_AGENT_ID is not configured.`, and
       * VoiceTutor renders whatever comes back in the error box on /coach. So a
       * learner who pressed the button to start their first class was shown the
       * name of an environment variable, in English. Nothing they can do with
       * that, and it reads as broken rather than as not-ready-yet.
       */
      console.error(`[signed-url] ${TEACHER.envKey} is not configured.`);
      return NextResponse.json({ error: NOT_AVAILABLE }, { status: 409 });
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
    const [sessionId, context, record, balance] = await Promise.all([
      startCoachSession(user.id, id),
      learnerContext(user.id),
      learnerRecord(user.id),
      getUsageBalance(user.id, user.email),
    ]);

    /*
     * How long this session can run, appended to the record the teacher opens on.
     *
     * Appended rather than sent as a fourth dynamic variable on purpose: a new
     * variable means a new placeholder on the agent, and an agent that has not been
     * re-synced would fail every conversation outright. This rides in a field that
     * already exists.
     *
     * It matters because the first session has to *finish* something. A teacher
     * that does not know it has eight minutes left will start the map, and the
     * learner will run out of minutes holding a plan instead of a finished task,
     * which is the exact failure the whole session order was rebuilt to avoid.
     */
    const left =
      balance?.monthlyMinutes === null || balance == null
        ? null
        : Math.max(0, Math.floor(balance.monthlyMinutes - balance.minutes));

    if (left !== null) {
      record.registro = `${record.registro} Le quedan ${left} minutos de clase${
        balance?.period === 'total' ? ' gratis en total' : ' este mes'
      }.`.slice(0, 900);
    }

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
      /*
       * Minutes left, so the browser can tell the teacher when time is short.
       *
       * The record already carries this number as prose, and the persona is
       * told to drop the map and finish the measurement when fewer than ten
       * remain. Both are read once, at connect, by a model that has no clock and
       * cannot notice the number going down. Null when this deployment does not
       * meter, which is the case where no nudge is possible or needed.
       */
      minutesLeft: left,
    });
  } catch (err) {
    /*
     * Everything the learner can see here is written for them.
     *
     * This returned `err.message`, and VoiceTutor puts that straight in the
     * error box. So the first click of a first session could show
     * "ElevenLabs 401 on /convai/conversation/get-signed-url: {detail...}" to
     * somebody who speaks Spanish and did not ask about our API keys, or
     * "ELEVENLABS_API_KEY is not set. Copy .env.example to .env.local", which
     * tells a learner to edit a file on our laptop.
     *
     * It is also the only place in the app that hands a signed-in stranger the
     * shape of our internal configuration. The detail belongs in the function
     * log, where somebody can act on it.
     */
    console.error('[signed-url] mint failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: NOT_AVAILABLE }, { status: 500 });
  }
}
