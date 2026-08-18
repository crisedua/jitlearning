-- What a learner may write with their own hands.
--
-- Run this once against your Supabase project:
--   Dashboard -> SQL Editor -> paste -> Run
--   or, with the CLI:  supabase db push
--
-- `actions.ts` opens with the rule this product runs on: a plan somebody can
-- edit into "done" measures nothing, so the status of a step comes from what was
-- taught and shown out loud, never from a checkbox. Until now that rule lived
-- only in the page. The row-level policies say `for update using (auth.uid() =
-- user_id)` and nothing about columns, so a signed-in learner holding the anon
-- key — which is public, it ships in the browser — could set every step to done
-- from a console, or write a saving of nine thousand minutes.
--
-- Nothing about that is a breach: it is their own row, it buys no minutes, and
-- the allowance is metered from `plan_usage`, which reads sessions rather than
-- steps. What it costs is the meaning of the numbers. `/admin/embudo` counts
-- finished tasks and measured tasks to answer whether the product works, and a
-- funnel anybody can type into cannot answer that.
--
-- Postgres has the right tool and RLS is not it: policies filter rows, and this
-- is a question about columns. Table-level UPDATE is replaced with a grant on
-- exactly the columns the learner's own two forms write, so the database
-- enforces what the comment already promised.
--
-- `service_role` is untouched and keeps writing everything, which is how the
-- post-call webhook records the lesson, the status and the minutes it heard.

-- The three columns on plan_steps: what they built, and the two numbers. Both
-- forms also stamp updated_at.
revoke update on public.plan_steps from authenticated;
grant update (evidence, minutes_before, minutes_after, updated_at)
  on public.plan_steps to authenticated;

-- The one answer a learner owns on a session: whether they did the thing they
-- promised. Everything else in that row is the transcript's account of the class.
revoke update on public.session_summaries from authenticated;
grant update (commitment_done)
  on public.session_summaries to authenticated;

-- And one permission nothing uses.
--
-- `career_profiles` carried "update own career profile" for the authenticated
-- role, and every read and write of that table in this codebase goes through the
-- service role: `careerProfile` and the webhook's writer both call
-- `supabaseAdmin()`. No form, no action, no page updates it as the learner.
--
-- It is the record the teacher opens on — role, field, years, chosen path — so
-- the cost of leaving it is a learner able to rewrite what the teacher believes
-- about them, through a client that never asks. Not a breach, and not a
-- capability anybody asked for either.
--
-- `profiles` already made this call, deliberately and with a comment saying so:
-- no insert or update policy, because those columns come from Google and from
-- Stripe. This is the same table shape and the same answer. Reading stays.
drop policy if exists "update own career profile" on public.career_profiles;
