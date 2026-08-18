-- The practice bench's ledger, and folding it into the one allowance.
--
-- Run this once against your Supabase project:
--   Dashboard -> SQL Editor -> paste -> Run
--   or, with the CLI:  supabase db push
--
-- The bench lets a learner talk to Gemini, Claude or ChatGPT from inside the
-- class, with the teacher watching what comes back (see src/lib/practica.ts).
-- Those calls cost money per message, which makes them the second metered thing
-- in the product and the first one the minutes ledger knows nothing about.
--
-- ## One allowance, not two
--
-- The obvious shape is a second limit — "quedan 12 minutos y 34 mensajes" — and
-- it is the wrong one. It is a second wall for a learner to hit, a second
-- number on the pricing page, a second meter to keep honest, and it buys
-- precision nobody asked for. So a practice message is converted into the
-- seconds of class it displaces, at the marginal cost of a spoken minute
-- (`USD_PER_MINUTE` in src/lib/practica.ts, derived from `costs.ts`), and
-- spends the allowance the learner already understands.
--
-- ## Why the views are restructured rather than extended
--
-- `plan_usage` was one `left join` onto `coach_sessions` with a `group by`.
-- Adding a second `left join` onto this table would multiply the rows — every
-- session paired with every practice message — and silently inflate both sums.
-- That failure is invisible: no error, no missing data, just a learner whose
-- twenty free minutes ran out in nine. Both views therefore aggregate in
-- scalar subqueries, where two independent sums cannot fan out against each
-- other.

-- ------------------------------------------------------ practice_messages ---
-- One row per exchange sent to a model from the bench. Written by the service
-- role from /api/practica, never by the browser: the seconds in here are spent
-- allowance, and allowance the client can write is not a limit.
create table if not exists public.practice_messages (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  -- The class this happened during, when there was one. Null is legitimate: a
  -- learner can practise on the classroom page without a call open, and losing
  -- the row because no session was running would lose the charge with it.
  session_id     uuid references public.coach_sessions (id) on delete set null,
  created_at     timestamptz not null default now(),

  -- Which of the three the learner picked, and what actually served it.
  -- Both, because the second is the audit trail: OpenRouter may route within a
  -- family, and "the learner chose Claude" and "Sonnet 5 answered" are
  -- different facts and only one of them is billable evidence.
  provider       text not null,
  model          text not null,

  prompt_tokens      integer,
  completion_tokens  integer,
  -- What OpenRouter said the call cost, in USD. Null when it did not say, which
  -- is why `billed_seconds` is a separate column rather than a computed one:
  -- a call whose price never arrived still has to be charged something.
  cost_usd       numeric,
  -- What was actually taken off the allowance. This is the number the views
  -- read, and the only one a billing question should ever be answered from.
  billed_seconds integer not null,

  -- Enough to reconstruct an exchange when a learner disputes it or a class
  -- goes wrong, without keeping their work: how many files and how much text,
  -- not the files and not the text.
  attachments    integer not null default 0,
  prompt_chars   integer not null default 0,
  answer_chars   integer not null default 0,
  -- Set when the exchange failed. A failed call can still have cost money.
  error          text
);

comment on table public.practice_messages is
  'One exchange with a practice model. `billed_seconds` is what it took off the learner''s minutes; see src/lib/practica.ts secondsForSpend().';

-- The two queries this table exists to answer: "what has this user spent in
-- the window" and "what did the bench cost us last month".
create index if not exists practice_messages_user_created_idx
  on public.practice_messages (user_id, created_at desc);
create index if not exists practice_messages_created_idx
  on public.practice_messages (created_at desc);

alter table public.practice_messages enable row level security;

-- Read-only, own rows. The views below run as their caller, so without this a
-- learner's own usage meter would read zero practice seconds while the gate
-- (service role) read the real ones — a meter that contradicts its own wall,
-- which this codebase has already shipped once.
drop policy if exists "read own practice" on public.practice_messages;
create policy "read own practice"
  on public.practice_messages for select
  using (auth.uid() = user_id);

-- ------------------------------------------------------------ plan_usage ----
-- Same contract as before — minutes and sessions in the current calendar month
-- — with practice seconds added to `minutes`.
--
-- `sessions` deliberately still counts only conversations. A plan that caps
-- sessions is capping classes, and making a typed message consume one would
-- lock a learner out of the class they are already in.
create or replace view public.plan_usage as
select
  p.id                       as user_id,
  p.plan_id,
  pl.monthly_minutes,
  pl.monthly_sessions,
  date_trunc('month', now()) as period_start,
  (
    coalesce((
      select sum(s.duration_seconds)
      from public.coach_sessions s
      where s.user_id = p.id
        and s.started_at >= date_trunc('month', now())
    ), 0)
    + coalesce((
      select sum(b.billed_seconds)
      from public.practice_messages b
      where b.user_id = p.id
        and b.created_at >= date_trunc('month', now())
    ), 0)
  ) / 60.0                   as minutes,
  -- Still only what ElevenLabs has confirmed. A practice message is billed by
  -- OpenRouter at the moment it happens and has nothing to reconcile later, so
  -- counting it here would make "synced" mean two different things.
  coalesce((
    select sum(s.duration_seconds)
    from public.coach_sessions s
    where s.user_id = p.id
      and s.started_at >= date_trunc('month', now())
      and s.usage_synced_at is not null
  ), 0) / 60.0               as synced_minutes,
  coalesce((
    select count(*)
    from public.coach_sessions s
    where s.user_id = p.id
      and s.started_at >= date_trunc('month', now())
  ), 0)                      as sessions
from public.profiles p
join public.plans pl on pl.id = p.plan_id;

alter view public.plan_usage set (security_invoker = on);
grant select on public.plan_usage to authenticated;

-- ------------------------------------------------------ plan_usage_total ----
-- The lifetime window, which is what the free tier is metered on.
create or replace view public.plan_usage_total as
select
  p.id        as user_id,
  p.plan_id,
  pl.monthly_minutes,
  pl.period,
  (
    coalesce((
      select sum(s.duration_seconds)
      from public.coach_sessions s
      where s.user_id = p.id
    ), 0)
    + coalesce((
      select sum(b.billed_seconds)
      from public.practice_messages b
      where b.user_id = p.id
    ), 0)
  ) / 60.0    as minutes,
  coalesce((
    select count(*)
    from public.coach_sessions s
    where s.user_id = p.id
  ), 0)       as sessions
from public.profiles p
join public.plans pl on pl.id = p.plan_id;

alter view public.plan_usage_total set (security_invoker = on);
grant select on public.plan_usage_total to authenticated;
