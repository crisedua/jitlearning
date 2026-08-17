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
