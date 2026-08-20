/**
 * What the learner practised in the lab, reported back.
 *
 * `iajit.vercel.app` is a second deployment on a second Supabase project, so
 * the same person has a different `auth.uid()` there and cannot write into this
 * database. This endpoint is the way across: the lab POSTs the turns it served,
 * carrying the signed token modojit put in the link that opened it, and this
 * writes them here as practice with no session attached.
 *
 * `practiceRecap` then reads exactly those rows, so the next class can open on
 * "vi que probaste la misma petición en tres modelos" instead of asking how it
 * went. That is the whole point of connecting the two: a teacher that has to
 * ask what happened spends the class reconstructing it.
 *
 * ## Why not the ingest secret
 *
 * Every other privileged route here carries `INGEST_SECRET` in a header, and
 * that works when the caller is our own server. It is wrong here: the shared
 * secret says "this request is from a trusted service" and says nothing about
 * *which learner* the rows belong to. The token says both, is scoped to one
 * person, and expires. A stolen one writes practice rows for one learner for a
 * few hours, which is the entire blast radius — this route cannot grant a plan,
 * spend class minutes, or read anything back.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin, serviceConfigured } from '@/lib/supabase/admin';
import { readLabToken } from '@/lib/lab-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A class is ten minutes; nobody practises more than this between two of them. */
const MAX_TURNS = 40;
/** Per turn. Longer than any prompt the bench accepts, and a hard stop on abuse. */
const MAX_CONTENT = 20_000;

interface Turn {
  role?: unknown;
  content?: unknown;
  model?: unknown;
  provider?: unknown;
  promptTokens?: unknown;
  completionTokens?: unknown;
  costUsd?: unknown;
  billedSeconds?: unknown;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    token?: unknown;
    turns?: unknown;
  } | null;

  if (!body) return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });

  const userId = readLabToken(typeof body.token === 'string' ? body.token : null);
  /*
   * One answer for every way a token can fail. The difference between expired
   * and forged is information only an attacker has a use for.
   */
  if (!userId) return NextResponse.json({ error: 'Invalid or expired token.' }, { status: 401 });

  if (!Array.isArray(body.turns)) {
    return NextResponse.json({ error: 'Expected `turns` to be an array.' }, { status: 400 });
  }

  const rows = (body.turns as Turn[])
    .slice(0, MAX_TURNS)
    .filter((t) => (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string')
    .map((t) => ({
      user_id: userId,
      /*
       * Null, always, and this is the field the whole feature turns on.
       *
       * `practiceRecap` reads rows with no session precisely because that is
       * what "practised on their own" means. A lab row written with a session
       * id would disappear into some class's transcript and the teacher would
       * never see it as homework.
       */
      session_id: null,
      role: t.role as 'user' | 'assistant',
      content: (t.content as string).slice(0, MAX_CONTENT),
      provider: typeof t.provider === 'string' ? t.provider : 'lab',
      model: typeof t.model === 'string' ? t.model : 'lab',
      prompt_tokens: typeof t.promptTokens === 'number' ? t.promptTokens : null,
      completion_tokens: typeof t.completionTokens === 'number' ? t.completionTokens : null,
      cost_usd: typeof t.costUsd === 'number' ? t.costUsd : null,
      /*
       * Whatever the lab says it cost, floored at zero and defaulting to zero.
       *
       * This column is summed by `plan_usage`, so it comes off the learner's
       * allowance — which means a caller could spend somebody's minutes by
       * lying about it. Zero is the safe default and the honest one while the
       * lab runs on its own budget: practice there does not take class time.
       * If that changes, the lab sends real seconds and this carries them.
       */
      billed_seconds:
        typeof t.billedSeconds === 'number' && t.billedSeconds > 0
          ? Math.min(Math.round(t.billedSeconds), 3_600)
          : 0,
      prompt_chars: t.role === 'user' ? (t.content as string).length : 0,
      answer_chars: t.role === 'assistant' ? (t.content as string).length : 0,
    }));

  if (rows.length === 0) return NextResponse.json({ recorded: 0 });

  if (!serviceConfigured()) {
    console.error('[lab] no service role configured; practice went unrecorded.');
    return NextResponse.json({ recorded: 0 });
  }

  const { error } = await supabaseAdmin().from('practice_messages').insert(rows);
  if (error) {
    console.error('[lab] could not record practice:', error.message);
    return NextResponse.json({ error: 'Could not record.' }, { status: 500 });
  }

  return NextResponse.json({ recorded: rows.length });
}
