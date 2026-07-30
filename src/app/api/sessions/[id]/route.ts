/**
 * Closes a usage row when a conversation ends.
 *
 * Called by the browser, which is the only party that knows the conversation
 * actually finished — the server handed out a credential and then stepped out
 * of the loop. That also means everything in the body is self-reported: a tab
 * that crashes reports nothing, and a hostile one could report anything.
 *
 * So this route is a convenience, not an accounting record. `npm run sync:usage`
 * reconciles every row against ElevenLabs' own numbers, and that is what any
 * billing decision should be based on. The write is scoped to the caller's own
 * user id, so the worst a learner can do is misstate their own minutes.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUser } from '@/lib/supabase/server';
import { finishCoachSession } from '@/lib/account';

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
