/**
 * Closes a usage row when a conversation ends.
 *
 * Called by the browser, which is the only party that knows the conversation
 * actually finished — the server handed out a credential and then stepped out
 * of the loop. That also means everything in the body is self-reported: a tab
 * that crashes reports nothing, and a hostile one could report anything.
 *
 * So this route is a convenience, not an accounting record. `npm run sync:usage`
 * reconciles rows against ElevenLabs' own numbers, and that is what any billing
 * decision should be based on — but only rows that carry a `conversation_id`,
 * which is why the PATCH below writes one as soon as the call connects instead
 * of waiting for the beacon that closes the row. The write is scoped to the caller's own
 * user id, so the worst a learner can do is misstate their own minutes.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUser } from '@/lib/supabase/server';
import { finishCoachSession, linkConversation } from '@/lib/account';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  conversationId: z.string().min(1).max(200).optional(),
  // A day's worth of seconds is already absurd for a coaching session; the cap
  // is here so a bad number cannot poison an aggregate later.
  durationSeconds: z.number().int().min(0).max(86_400).optional(),
  messageCount: z.number().int().min(0).max(10_000).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: 'No hay sesión iniciada.' }, { status: 401 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  await finishCoachSession(id, user.id, parsed.data);
  return NextResponse.json({ ok: true });
}

/**
 * Links a usage row to its ElevenLabs conversation, as soon as the call opens.
 *
 * Separate from the POST above because it means something different: POST says
 * the class is over and reports what it cost, PATCH says the class has a name
 * now. Folding it into POST would have stamped `ended_at` at connect time and
 * ended every session the instant it began.
 *
 * Fire-and-forget from the browser. If it fails the beacon at teardown is still
 * carrying the same id, so this is a second chance at the write rather than a
 * replacement for the first.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: 'No hay sesión iniciada.' }, { status: 401 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = z.object({ conversationId: z.string().min(1).max(200) }).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  await linkConversation(id, user.id, parsed.data.conversationId);
  return NextResponse.json({ ok: true });
}
