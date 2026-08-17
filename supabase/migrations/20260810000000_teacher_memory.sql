-- The teacher's memory: the profile, the plan, and one row per session.
--
-- Run this once against your Supabase project:
--   Dashboard -> SQL Editor -> paste -> Run
--   or, with the CLI:  supabase db push
--
-- This is the whole of what makes a session a continuation rather than a first
-- meeting, and it is what the progress page renders. Three tables:
--
--   career_profiles   one row per learner: who they are, their week, the map
--   plan_steps        their own plan, one row per step, with its evidence
--   session_summaries one row per finished session: what was taught, what was
--                     promised, whether it happened
--
-- Written by the service role from the post-call webhook, read on connect. The
-- learner may correct two things and nothing else: whether a commitment was
-- kept, and what they built. Everything else comes from the transcript, because
-- a plan somebody can edit into "done" is a plan that measures nothing.
--
-- Idempotent, and deliberately runnable on a project where the earlier
-- study_memory migration was applied: it drops the columns that belonged to the
-- two-coach product and adds the ones this one needs.

-- ------------------------------------------------------- career profile -----
create table if not exists public.career_profiles (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  role             text,
  field            text,
  sector           text,
  experience_years integer,
  -- The 3 to 5 tasks that fill the learner's week. Every level 2 lesson is
  -- anchored to one of them, so this is the column the teaching quality
  -- depends on: an empty array means the plan has no applied level at all.
  weekly_tasks     jsonb not null default '[]'::jsonb,
  tools            jsonb not null default '[]'::jsonb,
  ai_usage         text,
  goal             text,
  -- 'mejorar' | 'moverse' | 'propio', chosen at the end of the map. Decides
  -- which level 3 lessons the plan carries. Text rather than an enum so adding
  -- a path stays a code change.
  chosen_path      text,
  /*
   * The map, so it is never given twice:
   *   { value: text, categories: text, paths: text }
   * Stored as given to this person, not as a template. The teacher revisits one
   * part of it when the plan reaches that category, and never repeats it whole.
   */
  map              jsonb not null default '{}'::jsonb,
  updated_at       timestamptz not null default now()
);

alter table public.career_profiles
  add column if not exists chosen_path text;

-- The plan used to live here as a jsonb blob. It is `plan_steps` now: the
-- progress page needs to render one row per step with its own status and
-- evidence, and the learner needs to be able to update one step without
-- rewriting the array.
alter table public.career_profiles
  drop column if exists learning_plan;

alter table public.career_profiles enable row level security;

drop policy if exists "read own career profile" on public.career_profiles;
create policy "read own career profile"
  on public.career_profiles for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "update own career profile" on public.career_profiles;
create policy "update own career profile"
  on public.career_profiles for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------ plan steps -----
create table if not exists public.plan_steps (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- The lesson this step teaches, from src/lib/curriculum.ts. Fixed lessons
  -- carry their own id ('fun-01-que-hacen'); the level 2 steps are generated
  -- per task as 'apl-01'..'apl-05'.
  lesson_id    text not null,
  level        text not null check (level in ('fundamentos', 'aplicado', 'avanzado', 'portafolio')),
  title        text not null,
  -- The learner's own task, for level 2. Null for lessons identical for everyone.
  linked_task  text,
  status       text not null default 'pending'
                 check (status in ('pending', 'in_progress', 'done')),
  -- What the learner described building. The definition of progress: a step
  -- marked done with no evidence is a step to ask about again.
  evidence     text,
  commitment   text,
  commitment_date date,
  -- Position in the plan, so "paso 4 de 11" is the same number everywhere.
  position     integer not null default 0,
  updated_at   timestamptz not null default now(),
  unique (user_id, lesson_id)
);

create index if not exists plan_steps_user_idx
  on public.plan_steps (user_id, position);

alter table public.plan_steps enable row level security;

drop policy if exists "read own plan steps" on public.plan_steps;
create policy "read own plan steps"
  on public.plan_steps for select
  to authenticated
  using (auth.uid() = user_id);

-- The learner may edit their own evidence and mark a step done. They cannot
-- insert steps: the plan comes from the curriculum crossed with the diagnostic,
-- and a learner who could add rows could give themselves a different syllabus
-- than the one the teacher is working through.
drop policy if exists "update own plan steps" on public.plan_steps;
create policy "update own plan steps"
  on public.plan_steps for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------ session summaries ----
create table if not exists public.session_summaries (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  created_at      timestamptz not null default now(),
  -- The ElevenLabs conversation, unique so a webhook redelivery updates this row
  -- instead of adding a second one for the same session.
  conversation_id text unique,
  -- Which step was taught, or null for the diagnostic session.
  lesson_id       text,
  -- What was taught, in the teacher's words, for the history on the progress page.
  taught          text,
  commitment      text,
  commitment_date date,
  -- Null means nobody has answered yet, which is different from false. The
  -- learner sets it from the progress page, or the next session's transcript does.
  commitment_done boolean
);

-- Columns this product needs, for a project where the earlier migration ran.
alter table public.session_summaries add column if not exists lesson_id text;
alter table public.session_summaries add column if not exists taught text;
alter table public.session_summaries add column if not exists conversation_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'session_summaries_conversation_id_key'
  ) then
    alter table public.session_summaries
      add constraint session_summaries_conversation_id_key unique (conversation_id);
  end if;
end $$;

-- Columns that belonged to the two-coach product. `coach` is meaningless with
-- one agent; the rest were the PMP drill's record.
alter table public.session_summaries drop column if exists coach;
alter table public.session_summaries drop column if exists exam_or_target_date;
alter table public.session_summaries drop column if exists weak_areas;
alter table public.session_summaries drop column if exists questions_asked;
alter table public.session_summaries drop column if exists questions_missed;

-- commitment_done was created NOT NULL DEFAULT false by the earlier migration,
-- which cannot express "not answered yet".
alter table public.session_summaries alter column commitment_done drop not null;
alter table public.session_summaries alter column commitment_done drop default;

create index if not exists session_summaries_user_idx
  on public.session_summaries (user_id, created_at desc);

alter table public.session_summaries enable row level security;

drop policy if exists "read own session summaries" on public.session_summaries;
create policy "read own session summaries"
  on public.session_summaries for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "update own session summaries" on public.session_summaries;
create policy "update own session summaries"
  on public.session_summaries for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- --------------------------------------------------------- leftovers --------
-- Both recorded which coach was involved. There is one.
alter table public.profiles drop column if exists last_coach;
alter table public.coach_sessions drop column if exists coach;
