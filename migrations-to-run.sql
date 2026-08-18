-- ModoJIT: paste this whole file into the Supabase SQL editor and run it.
--
-- 10 migration(s), in order, all of them idempotent:
--   20260812000000_hours_saved.sql
--   20260813000000_billing.sql
--   20260814000000_level_names.sql
--   20260815000000_billing_event_claim.sql
--   20260816000000_plan_grants.sql
--   20260817000000_purchase_intent.sql
--   20260818000000_learner_columns.sql
--   20260819000000_recipes.sql
--   20260820000000_practica.sql
--   20260821000000_sandbox_transcript.sql
--
-- Safe to run more than once. Safe to run on a database where some of these
-- have already been applied.
--
-- It does NOT include the migrations that create profiles, plans, coach_sessions
-- or feedback: those predate this set and are assumed applied. On a fresh
-- database run `npm run sql -- 20260730` instead, or let `npm run doctor` tell
-- you which one is missing.

-- ==========================================================================
-- 20260812000000_hours_saved.sql
-- ==========================================================================

-- The two numbers that make the price an arithmetic problem.
--
-- Run this once against your Supabase project:
--   Dashboard -> SQL Editor -> paste -> Run
--   or, with the CLI:  supabase db push
--
-- Every level 1 step is one of the learner's own weekly tasks, done in the
-- session. The teacher asks how long it used to take before starting, and how
-- long it took this time when they finish. The difference is the only claim this
-- product can honestly make about its own value: it is the learner's own
-- measurement of their own task, on their own clock, and it recurs every week
-- because the task recurs every week.
--
-- Both columns are minutes, nullable, and only ever set for a task step. A step
-- with `minutes_after` set and no artifact described is still an unfinished step
-- (see `evidence`) — the number is evidence of speed, not of having done it.

alter table public.plan_steps
  add column if not exists minutes_before integer
    check (minutes_before is null or (minutes_before > 0 and minutes_before <= 2400));

alter table public.plan_steps
  add column if not exists minutes_after integer
    check (minutes_after is null or (minutes_after >= 0 and minutes_after <= 2400));

comment on column public.plan_steps.minutes_before is
  'Minutes this weekly task took the learner before, as they reported it. Null outside level 1.';
comment on column public.plan_steps.minutes_after is
  'Minutes the same task took with what they built. Null until the task has been done once.';

-- The bound is 40 hours: a single weekly task that eats a whole working week is
-- the largest figure that can be true, and anything past it is a
-- misheard-number problem rather than a very slow task. Rejecting it here keeps
-- one bad transcription from inventing hundreds of saved hours on the progress
-- page.

-- --------------------------------------------------------- weekly saving -----
-- One row per learner, so the progress page and the session record read the
-- same number instead of each summing it their own way.
--
-- Only steps the learner actually finished count. A task measured but left
-- `pending` is a measurement of an experiment, not of a change to their week.
create or replace view public.weekly_minutes_saved as
select
  user_id,
  sum(greatest(minutes_before - minutes_after, 0))          as minutes_per_week,
  count(*)                                                   as tasks_measured,
  min(updated_at)                                            as first_measured_at
from public.plan_steps
where level = 'semana'
  and status = 'done'
  and minutes_before is not null
  and minutes_after is not null
group by user_id;

alter view public.weekly_minutes_saved set (security_invoker = on);
grant select on public.weekly_minutes_saved to authenticated;

-- ------------------------------------------------------------ plan copy ------
-- The pricing page reads `blurb` from this table at request time, so the free
-- tier's description has to change with the shape of the first session. Keep
-- these identical to FALLBACK_PLANS in src/lib/plans.ts.
update public.plans
   set blurb = '20 minutos para resolver una tarea de tu semana y medir lo que ahorra.'
 where id = 'free';


-- ==========================================================================
-- 20260813000000_billing.sql
-- ==========================================================================

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


-- ==========================================================================
-- 20260814000000_level_names.sql
-- ==========================================================================

-- Fix a check constraint that rejects every plan the app now writes.
--
-- Run this once against your Supabase project:
--   Dashboard -> SQL Editor -> paste -> Run
--   or, with the CLI:  supabase db push
--
-- ## The bug
--
-- `plan_steps.level` was created with
--   check (level in ('fundamentos', 'aplicado', 'avanzado', 'portafolio'))
-- which were the level ids at the time. Inverting the curriculum renamed them to
-- `semana`, `criterio`, `flujo`, `portafolio` in `src/lib/curriculum.ts`, and
-- nothing renamed them here.
--
-- The consequence is total and silent. `ensurePlan()` inserts one row per step
-- with `level = 'semana'`, Postgres rejects the whole insert with a check
-- violation, and `progress.ts` logs it and returns 0 because every read and write
-- in that module fails soft by design. So: no plan is ever created, no step is
-- ever measured, `/progreso` stays empty forever, and the offer that depends on a
-- measured saving never appears. The product's entire core loop, defeated by four
-- strings in a constraint.
--
-- Nothing catches this. TypeScript does not read SQL, the test suite has no
-- database, and `create table if not exists` will not alter an existing table's
-- constraints, so re-running the earlier migration fixes nothing either. It is a
-- contract that spans two languages with no compiler over the join.
-- `src/lib/curriculum.test.ts` now asserts the two agree.

-- Remap any rows written under the old names, oldest to newest level.
-- Ordinarily a no-op: plan creation has been failing this constraint, so there is
-- usually nothing to remap. Correct for anybody who ran the earlier migration and
-- created plans before the rename.
update public.plan_steps set level = 'semana'   where level = 'aplicado';
update public.plan_steps set level = 'criterio' where level = 'fundamentos';
update public.plan_steps set level = 'flujo'    where level = 'avanzado';

-- Then the constraint itself. Dropped by name: Postgres derives
-- `plan_steps_level_check` from the table and column, and `if exists` keeps this
-- runnable on a database that never had it.
alter table public.plan_steps
  drop constraint if exists plan_steps_level_check;

alter table public.plan_steps
  add constraint plan_steps_level_check
  check (level in ('semana', 'criterio', 'flujo', 'portafolio'));


-- ==========================================================================
-- 20260815000000_billing_event_claim.sql
-- ==========================================================================

-- Stop the duplicate gate from swallowing a payment it failed to apply.
--
-- Run this once against your Supabase project:
--   Dashboard -> SQL Editor -> paste -> Run
--   or, with the CLI:  supabase db push
--
-- ## The bug
--
-- `billing_events` recorded an event id *before* the handler ran, and the route
-- treated "id already present" as "already applied". Those are not the same
-- thing, and the gap between them is where a paid upgrade disappears:
--
--   1. Stripe delivers checkout.session.completed
--   2. the id is inserted, the gate says "new", the handler starts
--   3. subscriptions.retrieve times out, or Supabase blips, or the function is
--      killed at the deadline
--   4. the route returns 500, correctly, so Stripe will retry
--   5. the retry arrives, finds the id already recorded, and returns 200
--
-- The customer has been charged and is on the free plan, permanently, with no
-- further delivery coming and nothing in any log after step 3. The webhook file
-- describes this exact outcome as the worst failure the app can have, in a
-- comment explaining why handlers return 500 — and then the dedup in front of
-- them caused it anyway.
--
-- ## The fix
--
-- Split "claimed" from "handled". The insert still claims the event, so two
-- concurrent deliveries cannot both run. `handled_at` is written only after the
-- handler succeeds, and a claimed-but-unhandled row is reprocessed on the next
-- delivery. Applying a subscription twice sets the same plan to the same value,
-- so the retry is safe; not applying it at all is not.

alter table public.billing_events
  add column if not exists handled_at timestamptz;

-- Rows written under the old semantics were recorded after being processed, so
-- they are handled by definition. Without this backfill the first retry of any
-- historical event would reprocess it, which is harmless but noisy.
update public.billing_events
  set handled_at = received_at
  where handled_at is null;

-- Finding the events that were claimed and never finished is the first question
-- anybody asks when a payment did not land.
create index if not exists billing_events_unhandled_idx
  on public.billing_events (received_at)
  where handled_at is null;


-- ==========================================================================
-- 20260816000000_plan_grants.sql
-- ==========================================================================

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


-- ==========================================================================
-- 20260817000000_purchase_intent.sql
-- ==========================================================================

-- Somebody said they want to pay.
--
-- Run this once against your Supabase project:
--   Dashboard -> SQL Editor -> paste -> Run
--   or, with the CLI:  supabase db push
--
-- Checkout is not configured yet, so the buy button on /planes opens a
-- prefilled email or WhatsApp message. That works: a person can buy, and you
-- charge them by hand. What it cannot do is leave a trace. If somebody clicks
-- "Conversemos" and then does not send the message, or sends it and the
-- notification is missed, nothing anywhere records that a person got as far as
-- deciding to pay. The funnel at /admin/embudo counts accounts, sessions and
-- finished steps, and stops one step short of the only one that pays for the
-- rest.
--
-- One row per click on a buy button. Not a purchase: an attempt, which is the
-- thing you cannot currently see and the thing worth knowing the rate of. A
-- person who clicked and never wrote is a sale that was in reach; today that
-- event is invisible, and invisible is the same as absent when you are deciding
-- whether anybody wants this.
--
-- ## Deliberately nothing free-form
--
-- No name, no email, no message, no user agent, no IP. Every column is either a
-- foreign key or checked against a fixed set, so this table cannot be used to
-- store anything a stranger typed. That is the price of writing it from a public
-- endpoint: the row is a fact about a click and cannot be anything else.
create table if not exists public.purchase_intents (
  id          uuid primary key default gen_random_uuid(),
  -- Null when the clicker was signed out, which on a public pricing page is
  -- most of them. When it is set, the intent is recoverable: you know who to
  -- write to, rather than only how many people meant to.
  user_id     uuid references auth.users (id) on delete set null,
  -- Text rather than a foreign key to plans: a click on a tier that is later
  -- retired is still evidence, and losing the history to a cascade would defeat
  -- the point of keeping it.
  plan_id     text not null,
  channel     text not null check (channel in ('email', 'whatsapp')),
  created_at  timestamptz not null default now()
);

create index if not exists purchase_intents_created_idx
  on public.purchase_intents (created_at desc);

-- RLS on, no policies: closed to every client-side role, exactly like feedback.
-- Rows arrive through the service role in /api/intent, and are read by the
-- funnel page, which is already behind the admin check.
alter table public.purchase_intents enable row level security;


-- ==========================================================================
-- 20260818000000_learner_columns.sql
-- ==========================================================================

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


-- ==========================================================================
-- 20260819000000_recipes.sql
-- ==========================================================================

-- The thing the teacher dictated, kept where it can be reused.
--
-- Run this once against your Supabase project:
--   Dashboard -> SQL Editor -> paste -> Run
--   or, with the CLI:  supabase db push
--
-- The class is voice, and the most technical part of it is the teacher saying
-- what to write into the assistant: the instruction, the context, the format.
-- Until now that text existed only in the air. The learner heard a four-line
-- prompt while walking and was expected to carry it home, and the notebook —
-- which exists precisely because voice does not persist — held everything about
-- the lesson except the one artifact they need again next Tuesday.
--
-- Level 2's own proof is "una petición tuya escrita con las 3 partes, guardada
-- para reusar" (src/lib/curriculum.ts). The curriculum has been asking for an
-- artifact with nowhere to live.
--
-- These sit on the step rather than on the session because the step is what
-- recurs. A weekly task is done again every week, and the prompt that made it
-- fast is the reason the measured saving repeats instead of being a one-off.
-- Session history would scatter the same text across every conversation that
-- touched the task.

alter table public.plan_steps
  add column if not exists recipe_prompt text;

alter table public.plan_steps
  add column if not exists recipe_check text;

comment on column public.plan_steps.recipe_prompt is
  'The text the teacher dictated for the learner to paste into an assistant, verbatim. Null when the session only explained.';
comment on column public.plan_steps.recipe_check is
  'How to check that output before trusting it, for this kind of task. Null when no check was given.';

-- Deliberately unconstrained text. A prompt is prose the learner is meant to
-- edit, and a length check here would truncate the long ones — which are the
-- good ones, because context is what makes the answer better and that is the
-- lesson (see cri-01-contexto). The extractor is told to return the text or
-- nothing, and nothing is a legitimate outcome for a session that only talked.


-- ==========================================================================
-- 20260820000000_practica.sql
-- ==========================================================================

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


-- ==========================================================================
-- 20260821000000_sandbox_transcript.sql
-- ==========================================================================

-- The practice bench keeps its transcript.
--
-- Run this once against your Supabase project:
--   Dashboard -> SQL Editor -> paste -> Run
--   or, with the CLI:  supabase db push
--
-- ## This reverses a decision made one migration ago
--
-- 20260820000000 stored counts and no content, deliberately: "a product whose
-- first lesson is what never goes into a chat window has no business storing
-- the documents it teaches people to be careful with". The teacher still saw
-- every exchange, because it arrives over the open call as a contextual update
-- and never needed a database to get there.
--
-- The spec asks for the content, and the reason is a real one the earlier
-- design did not serve: coaching on prompt quality across sessions. A teacher
-- that can only see the exchange happening in front of it cannot say "esto te
-- pasó igual la semana pasada, escribiste la petición sin decir para quién es".
-- That is the difference between a reaction and a lesson, and it needs the
-- text to persist.
--
-- What that costs is stated plainly rather than absorbed: we are now keeping
-- what learners type into an assistant, including whatever they pasted out of
-- their work. `/privacidad` says so in the same words. The bench keeps telling
-- them to strip names and client data before uploading, and that instruction
-- carries more weight now, not less.
--
-- Files are still not stored. Only the text of the message and the answer.
--
-- ## One row per message, not per exchange
--
-- The previous shape was one row per exchange, which is the cheaper record and
-- the wrong one for reading a transcript back: a conversation is a sequence of
-- turns, and reconstructing it from paired columns means a query that knows
-- which half is which. `role` and `content` make it an ordinary transcript
-- table that can be selected in `created_at` order and handed to a model.
--
-- `billed_seconds` stays on the assistant row and is 0 on the user's. The two
-- usage views sum that column, so nothing about metering changes.

alter table public.practice_messages
  add column if not exists role text;

alter table public.practice_messages
  add column if not exists content text;

comment on column public.practice_messages.role is
  'Who wrote it: user or assistant. Null on rows written before the transcript was kept.';

comment on column public.practice_messages.content is
  'The message text, verbatim. Null on rows written before the transcript was kept, and on a row whose exchange failed before there was anything to record.';

-- Reading a session's transcript back in order is now the main query, and it
-- was not indexed for: the existing index is (user_id, created_at desc), which
-- serves "what has this learner spent" and scans for "what happened in this
-- class". Partial, because most rows carry no session.
create index if not exists practice_messages_session_idx
  on public.practice_messages (session_id, created_at)
  where session_id is not null;

-- `billed_seconds` was `not null` with no default, which was right when every
-- row was an exchange that cost something. A user row costs nothing and is
-- written in the same insert, so the default carries it rather than making
-- every caller remember the zero.
alter table public.practice_messages
  alter column billed_seconds set default 0;
