'use server';

/**
 * The only two things a learner may change by hand.
 *
 * Everything else on the progress page comes out of a transcript. That is the
 * point: a plan somebody can edit into "done" measures nothing, so the status of
 * a step is set by what was taught and shown out loud, not by a checkbox.
 *
 * What the learner does own is the answer to "did you do it" and the description
 * of what they built. Both are things only they can know.
 *
 * ## Why the request-scoped client, not the service role
 *
 * These writes run as the signed-in learner, so row-level security is what
 * enforces ownership: the `update own ...` policies restrict every statement to
 * `auth.uid() = user_id`. A missing or forged id fails at the database rather
 * than depending on a check in this file being right.
 */
import { revalidatePath } from 'next/cache';
import { createClient, currentUser } from '@/lib/supabase/server';

/** Long enough to describe what was built, short enough to stay a description. */
const EVIDENCE_CHARS = 2_000;

export async function saveEvidence(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user) return;

  const stepId = String(formData.get('stepId') ?? '');
  if (!stepId) return;

  const raw = String(formData.get('evidence') ?? '').trim();
  const evidence = raw ? raw.slice(0, EVIDENCE_CHARS) : null;

  const supabase = await createClient();
  const { error } = await supabase
    .from('plan_steps')
    .update({ evidence, updated_at: new Date().toISOString() })
    .eq('id', stepId);

  if (error) console.error('[progreso] evidence write failed:', error.message);
  revalidatePath('/progreso');
}

/**
 * Answer the open question on a session's commitment.
 *
 * Three states, not two: null means nobody has said yet, which is what a fresh
 * row carries and is different from "no". The button that sets false is as
 * important as the one that sets true, because a commitment quietly dropped is
 * the failure the whole follow-up exists to catch.
 */
export async function setCommitmentDone(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user) return;

  const sessionId = String(formData.get('sessionId') ?? '');
  if (!sessionId) return;

  const done = formData.get('done') === 'true';

  const supabase = await createClient();
  const { error } = await supabase
    .from('session_summaries')
    .update({ commitment_done: done })
    .eq('id', sessionId);

  if (error) console.error('[progreso] commitment write failed:', error.message);
  revalidatePath('/progreso');
}
