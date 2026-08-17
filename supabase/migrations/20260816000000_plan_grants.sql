-- Make the /feedback deal something the app can actually honour.
--
-- Run this once against your Supabase project:
--   Dashboard -> SQL Editor -> paste -> Run
--   or, with the CLI:  supabase db push
--
-- ## What was missing
--
-- /feedback promises, in the product's own words: "lo pruebas, dejas tu
-- feedback, y te activo 3 meses gratis del plan Fundador. Solo para las
-- primeras 10 personas."
--
-- Three obligations, and the app could keep none of them. Feedback arrived in a
-- table nothing read. There was no way to put somebody on a plan without a
-- Stripe subscription, so honouring the deal meant hand-writing SQL. Nothing
-- counted the ten seats. And nothing knew when three months were up, so every
-- grant made by hand would have quietly become permanent.
--
-- That deal is how the first ten people are recruited, which makes it the one
-- promise in the product that everything else depends on being kept.
--
-- ## Why two columns on profiles rather than a grants table
--
-- `plan_usage` joins `profiles.plan_id`, and the gate, the balance meter and the
-- offer all read through it. Keeping `plan_id` as the single answer to "what
-- plan is this person on" means a grant needs no new code path in any of them:
-- it sets the same column a payment sets. These two columns record only what
-- `plan_id` cannot say on its own — that this one was given rather than bought,
-- and until when.
--
-- A grants table would be the right shape for a history of many grants per
-- person. There are ten seats, once.

alter table public.profiles
  add column if not exists plan_granted_until timestamptz,
  add column if not exists plan_grant_reason  text;

comment on column public.profiles.plan_granted_until is
  'When a comped plan reverts to free. Null means the plan was paid for, not given.';

comment on column public.profiles.plan_grant_reason is
  'Why the plan was given. "feedback" for the /feedback deal.';

-- Finding the grants that are due to end, which is the question the admin page
-- and `npm run doctor` both ask.
create index if not exists profiles_plan_granted_until_idx
  on public.profiles (plan_granted_until)
  where plan_granted_until is not null;
