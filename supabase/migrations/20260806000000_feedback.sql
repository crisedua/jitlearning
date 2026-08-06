-- Feedback, traded for access.
--
-- Run this once against your Supabase project:
--   Dashboard -> SQL Editor -> paste -> Run
--   or, with the CLI:  supabase db push
--
-- One row per submission from /feedback. The offer on that page is six months
-- of full access in exchange for real feedback, so the email matters: it is
-- how the person gets contacted and how their account gets found to apply the
-- grant. `user_id` is filled when the submitter was signed in, which makes
-- applying the grant a one-line plan_id update instead of an email search.
create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  -- Null for signed-out submitters; set null on account deletion so the
  -- feedback itself survives the account.
  user_id     uuid references auth.users (id) on delete set null,
  name        text not null,
  email       text not null,
  message     text not null,
  created_at  timestamptz not null default now(),
  -- Stamped by hand when the six months are activated, so the promise has a
  -- ledger: a row with an email and no stamp is an unpaid debt.
  granted_at  timestamptz
);

create index if not exists feedback_created_idx
  on public.feedback (created_at desc);

-- RLS on, no policies: closed to every client-side role. Submissions arrive
-- through the service role in /api/feedback, and reading them is done from
-- the Supabase dashboard — feedback about the product is for whoever runs it,
-- not for other visitors.
alter table public.feedback enable row level security;
