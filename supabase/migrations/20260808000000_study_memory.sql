-- Study memory: what the coach knows about you before you say a word.
--
-- Run this once against your Supabase project:
--   Dashboard -> SQL Editor -> paste -> Run
--   or, with the CLI:  supabase db push
--
-- Two tables, because the two coaches remember different things. PMP needs a
-- per-session record: which domains were weak, which questions were missed,
-- how many days to the exam. Empleabilidad needs one durable record per
-- learner: the profile, the map they were given, and the plan they are walking
-- through, updated in place as steps get done.
--
-- Both are written by the service role after a call and read on connect, where
-- a compact summary is injected into the agent's dynamic variables. Without
-- them every session starts cold, which for a study partner is close to
-- useless: the whole promise is "la última vez fallaste 2 de 3 en interesados".

-- ------------------------------------------------------------- sessions -----
create table if not exists public.session_summaries (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  -- 'pmp' | 'empleabilidad'. Text rather than an enum so retiring or adding a
  -- coach stays a code change, as it has been twice already.
  coach               text not null,
  created_at          timestamptz not null default now(),
  -- The exam date, or the date the learner is aiming at. Drives the countdown
  -- the persona says out loud.
  exam_or_target_date date,
  -- Domains or subjects the learner was weakest in this session, so the next
  -- one can bias toward them. jsonb array of strings.
  weak_areas          jsonb not null default '[]'::jsonb,
  questions_asked     jsonb not null default '[]'::jsonb,
  questions_missed    jsonb not null default '[]'::jsonb,
  commitment          text,
  commitment_date     date,
  commitment_done     boolean not null default false
);

create index if not exists session_summaries_user_idx
  on public.session_summaries (user_id, coach, created_at desc);

alter table public.session_summaries enable row level security;

drop policy if exists "read own session summaries" on public.session_summaries;
create policy "read own session summaries"
  on public.session_summaries for select
  to authenticated
  using (auth.uid() = user_id);

-- Learners may correct their own history — mark a commitment done, fix an exam
-- date — but the rows are created by the service role after a call, which is
-- what keeps "you missed 2 of 3" from being self-reported.
drop policy if exists "update own session summaries" on public.session_summaries;
create policy "update own session summaries"
  on public.session_summaries for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------- career profile -----
-- One row per learner, not per session: the profile and the plan are the
-- thing that persists, and every follow-up session reads and updates it.
create table if not exists public.career_profiles (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  role             text,
  field            text,
  sector           text,
  experience_years integer,
  -- The 3 to 5 tasks that fill the learner's week. Every lesson is anchored to
  -- one of them, so this is the column the teaching quality depends on.
  weekly_tasks     jsonb not null default '[]'::jsonb,
  tools            jsonb not null default '[]'::jsonb,
  ai_usage         text,
  goal             text,
  /*
   * The map given in the diagnostic, kept so later sessions can zoom into one
   * of its categories instead of repeating it:
   *   { value_of_knowledge, tool_categories, application_paths, chosen_path }
   */
  map              jsonb not null default '{}'::jsonb,
  /*
   * Ordered array of steps. Each:
   *   { level: 'fundamentos' | 'aplicado' | 'avanzado' | 'portafolio',
   *     objective, linked_task, tool, exercise, proof,
   *     status: 'pending' | 'in_progress' | 'done',
   *     evidence }
   *
   * `evidence` is the learner's own description of what they built, filled at
   * review. Progress is only real if the artifact exists, so a step with
   * status done and no evidence is a step to ask about again.
   */
  learning_plan    jsonb not null default '[]'::jsonb,
  updated_at       timestamptz not null default now()
);

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

-- ------------------------------------------------------- last coach ---------
-- Which coach this learner picked last, so the picker preselects it. On the
-- profile rather than in a cookie: the choice should survive a new device.
alter table public.profiles
  add column if not exists last_coach text;

-- ------------------------------------------------------- session coach ------
-- Which coach a session belonged to. Without it the post-call backfill cannot
-- attribute a summary: it sees an agent id, and mapping that back to a coach
-- would break the moment an agent is reprovisioned.
alter table public.coach_sessions
  add column if not exists coach text;
