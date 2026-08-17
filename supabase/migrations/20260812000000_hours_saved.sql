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
