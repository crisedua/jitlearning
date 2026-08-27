-- Sign-ups: the people who asked to start, before there is an account.
--
-- Run this once against your Supabase project:
--   Dashboard -> SQL Editor -> paste -> Run
--   or, with the CLI:  supabase db push
--
-- One row per submission from /registro. This is deliberately not `profiles`,
-- which is Supabase's own identity mirrored into this schema and written only
-- by the trigger in 20260730000000_init_accounts.sql. Signing up here is a
-- statement of interest, not an authentication: there is no password, the
-- person may never come back, and most of what is asked for — a phone number,
-- whether they are working — is not something Google returns and not something
-- `profiles` has a column for.
--
-- Keeping them apart is what lets both stay honest. `profiles` answers "who has
-- an account"; this answers "who asked", which is the larger number and the one
-- the funnel is measured on.
--
-- `user_id` is the join between them, filled when the submitter happened to be
-- signed in already. Null is the normal case and not a defect.
create table if not exists public.signups (
  id          uuid primary key default gen_random_uuid(),
  -- Null for signed-out submitters; set null on account deletion so the
  -- sign-up itself survives the account, exactly as feedback does.
  user_id     uuid references auth.users (id) on delete set null,
  -- The name on the record.
  full_name   text not null,
  -- What the teacher should actually say out loud. Asked separately because the
  -- two are routinely different — a Francisca who is Fran to everyone — and a
  -- voice teacher that opens by reading a legal name has already got it wrong
  -- in the first second, on the one channel where there is no way to skim past.
  call_name   text not null,
  -- Stored lowercased by /api/signups, so this constraint is the real thing and
  -- not a formality: without normalising first, Ana@x.cl and ana@x.cl are two
  -- rows and the second sign-up looks like a second person.
  email       text not null unique,
  phone       text not null,
  -- 'student' | 'unemployed' | 'employed'. Pinned against the TypeScript union
  -- by signup.test.ts, because this project has already lost a feature to a
  -- check constraint that listed values the code had renamed: plan_steps.level
  -- rejected every insert, the write failed soft as designed, and the page was
  -- empty for everybody with no error anywhere.
  employment  text not null check (employment in ('student', 'unemployed', 'employed')),
  created_at  timestamptz not null default now(),
  -- Stamped again when somebody re-submits with corrected details, which the
  -- route treats as an edit rather than a duplicate. A row where the two differ
  -- is somebody who came back and fixed something.
  updated_at  timestamptz not null default now()
);

-- The one query this table exists to answer: who signed up, most recent first.
create index if not exists signups_created_idx
  on public.signups (created_at desc);

-- RLS on, no policies: closed to every client-side role. Rows arrive through the
-- service role in /api/signups, and are read from the Supabase dashboard. A
-- table holding names, emails and phone numbers is the last one that should be
-- readable by any browser that asks.
alter table public.signups enable row level security;
