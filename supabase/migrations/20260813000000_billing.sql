-- Taking money: the columns Stripe needs and nothing else.
--
-- Run this once against your Supabase project:
--   Dashboard -> SQL Editor -> paste -> Run
--   or, with the CLI:  supabase db push
--
-- Until now `profiles.plan_id` could only be changed by hand in the SQL editor,
-- which is why every paid button on /planes opened an email client. These columns
-- are what let a checkout set it instead.
--
-- ## plan_id is still only ever written by the server
--
-- There are no insert or update policies on `profiles`, and this migration adds
-- none. Every write here goes through the service role, and the only code path
-- that sets `plan_id` is the Stripe webhook, after verifying the signature. A
-- browser cannot upgrade itself, which matters more than it sounds: `plan_id` is
-- what `checkPlanAllowance` reads to decide how many minutes somebody gets.

-- ------------------------------------------------------------- plans ---------
-- The price object in Stripe that corresponds to this row. Null on `free`, and
-- null on any paid plan that has not been created in Stripe yet — the checkout
-- route refuses those rather than starting a session it cannot complete.
alter table public.plans
  add column if not exists stripe_price_id text unique;

comment on column public.plans.stripe_price_id is
  'Stripe Price id (price_...). Null means this plan cannot be bought yet. The amount charged is Stripe''s, not price_minor: keep them in step by hand.';

-- ------------------------------------------------------------ profiles -------
-- Two ids and a status, which is the minimum needed to answer "what is this
-- person paying for, and can they cancel it themselves".
alter table public.profiles
  add column if not exists stripe_customer_id text unique;

alter table public.profiles
  add column if not exists stripe_subscription_id text unique;

-- Mirrors Stripe's subscription status so the app can tell a lapsed payment from
-- a cancellation without calling the API on every page render. Text rather than
-- an enum: Stripe adds statuses, and a check constraint that rejects a new one
-- would drop a webhook we need to process.
alter table public.profiles
  add column if not exists subscription_status text;

-- When the current paid period ends. Shown to the learner so a cancellation
-- reads as "you keep it until the 14th" rather than as an immediate loss.
alter table public.profiles
  add column if not exists subscription_ends_at timestamptz;

comment on column public.profiles.subscription_status is
  'Stripe subscription status: active, trialing, past_due, canceled, unpaid, incomplete. Null for a learner who never subscribed.';

-- ------------------------------------------------- webhook idempotency -------
-- Stripe delivers at least once, and retries after any non-2xx. Without a record
-- of what has been handled, a retried `checkout.session.completed` is harmless
-- but a retried subscription change can apply out of order and leave a paying
-- learner on the free plan.
--
-- The primary key is Stripe's own event id, so inserting is the check: a conflict
-- means this event was already applied.
create table if not exists public.billing_events (
  id           text primary key,
  type         text not null,
  received_at  timestamptz not null default now()
);

-- RLS with no policies at all: this table is service-role only. It holds no
-- learner data and nothing in the app has any reason to read it from a browser.
alter table public.billing_events enable row level security;

-- ------------------------------------------------------------ index ----------
-- The webhook looks a profile up by customer id on every subscription event.
create index if not exists profiles_stripe_customer_idx
  on public.profiles (stripe_customer_id);
