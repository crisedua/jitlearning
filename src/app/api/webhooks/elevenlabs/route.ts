/**
 * The post-call webhook: where a finished conversation becomes memory.
 *
 * ElevenLabs analyses every call after it ends, extracting the fields declared
 * in `dataCollection()`. This route receives that analysis and writes it into
 * `career_profiles`, `plan_steps` and `session_summaries` (see `progress.ts`).
 *
 * ## Why a webhook and not the existing lazy backfill
 *
 * Session memory already worked without one: `memory.ts` fetches summaries on
 * the next connect. That is fine for a paragraph of free text and wrong for the
 * plan. The plan has to exist before the learner opens the progress page, which
 * is the thing that brings them back between sessions, and "the next time you
 * start a call" is too late for a page whose whole job is to be looked at in
 * between. The lazy path stays as the fallback for a deployment with no webhook
 * configured.
 *
 * ## Setup
 *
 *   ElevenLabs dashboard -> Conversational AI -> Settings -> Webhooks
 *   URL:    https://<app>.vercel.app/api/webhooks/elevenlabs
 *   Events: post_call_transcription
 *   Copy the signing secret into ELEVENLABS_WEBHOOK_SECRET.
 *
 * Without that secret this route refuses every request. An unauthenticated
 * endpoint that writes to a learner's profile is worse than no webhook: anybody
 * could rewrite anyone's plan by guessing a user id.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { saveTranscript } from '@/lib/transcripts';
import { applyConversation } from '@/lib/progress';
import { serviceConfigured, supabaseAdmin } from '@/lib/supabase/admin';
import type { ConversationDetail } from '@/lib/elevenlabs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * How stale a signature may be. ElevenLabs signs `${timestamp}.${body}`, so a
 * captured request cannot be replayed indefinitely. 30 minutes is their own
 * tolerance, and it has to survive a redelivery after a transient failure.
 */
const TOLERANCE_SECONDS = 30 * 60;

/**
 * Verify `ElevenLabs-Signature: t=<unix>,v0=<hex hmac>` over `${t}.${rawBody}`.
 *
 * Compared with `timingSafeEqual`, and length-checked first because that
 * function throws on a mismatch rather than returning false.
 */
function verify(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;

  const parts = new Map(
    header.split(',').map((part) => {
      const [k, ...rest] = part.trim().split('=');
      return [k ?? '', rest.join('=')] as const;
    }),
  );

  /*
   * `sent` is the timestamp exactly as it arrived, and it is what goes into the
   * HMAC. Signing over `Number(sent)` instead would work until the day the
   * string does not survive a round trip through a float, at which point every
   * webhook 401s and the entire memory pipeline stops with a correct-looking
   * signature check. Free to avoid, so it is avoided.
   */
  const sent = parts.get('t');
  const provided = parts.get('v0');
  if (!sent || !provided) return false;

  const timestamp = Number(sent);
  if (!Number.isFinite(timestamp)) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (age > TOLERANCE_SECONDS) return false;

  const expected = createHmac('sha256', secret).update(`${sent}.${rawBody}`).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The slice of the payload this route uses. */
interface PostCallPayload {
  type?: string;
  data?: {
    conversation_id?: string;
    analysis?: ConversationDetail['analysis'];
    /*
     * The class itself. Arrives because the workspace webhook is registered
     * with `transcript_format: "json"`, and was read by nothing until the
     * learner's own record started keeping it.
     */
    transcript?: unknown;
  };
}

/**
 * Whose session was it?
 *
 * From the usage ledger, never from the payload. The conversation id is the join
 * key: `coach_sessions` recorded who the signed URL was minted for, so a request
 * cannot name a user of its own choosing even if the signature check were ever
 * bypassed.
 */
async function userFor(conversationId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .from('coach_sessions')
    .select('user_id')
    .eq('conversation_id', conversationId)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return (data as { user_id: string | null }).user_id ?? null;
}

export async function POST(req: Request) {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: 'ELEVENLABS_WEBHOOK_SECRET is not configured.' },
      { status: 503 },
    );
  }

  // Read as text, verify, then parse. Parsing first and re-serialising would
  // change the bytes the signature covers.
  const rawBody = await req.text();
  const signature =
    req.headers.get('elevenlabs-signature') ?? req.headers.get('ElevenLabs-Signature');

  if (!verify(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
  }

  let payload: PostCallPayload;
  try {
    payload = JSON.parse(rawBody) as PostCallPayload;
  } catch {
    return NextResponse.json({ error: 'Body is not JSON.' }, { status: 400 });
  }

  if (payload.type && payload.type !== 'post_call_transcription') {
    // Another event type we did not ask for. Accepted so ElevenLabs stops
    // retrying it, and ignored.
    return NextResponse.json({ ignored: payload.type });
  }

  const conversationId = payload.data?.conversation_id;
  if (!conversationId) {
    return NextResponse.json({ error: 'No conversation_id in payload.' }, { status: 400 });
  }

  if (!serviceConfigured()) {
    return NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 503 });
  }

  const userId = await userFor(conversationId);
  if (!userId) {
    // A conversation with no usage row: a dashboard test, or a session minted
    // before the ledger existed. Nothing to attribute it to, and a 200 keeps
    // ElevenLabs from retrying it forever.
    return NextResponse.json({ ignored: 'unknown conversation' });
  }

  const result = await applyConversation(userId, conversationId, payload.data?.analysis);

  /*
   * After the summary, never instead of it.
   *
   * `applyConversation` writes the map, the plan and the two numbers — the
   * things the product is built on. This writes the words, which are what
   * somebody re-reads. Awaited so a redelivery cannot race itself, and unable
   * to fail loudly: `saveTranscript` swallows its own errors, so a class that
   * cannot be stored costs the reading of it and not the evidence.
   */
  const stored = await saveTranscript(userId, conversationId, payload.data?.transcript);

  return NextResponse.json({ ok: true, ...result, turns: stored });
}
