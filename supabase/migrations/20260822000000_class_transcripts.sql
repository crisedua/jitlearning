-- The class itself, kept so the learner can read it back.
--
-- Until now the only trace of a class was its summary: what was taught, the
-- commitment, the two numbers. The words stayed on the ElevenLabs side, where
-- `src/lib/classes.ts` could fetch them and only /admin/embudo ever did. A
-- learner who wanted to re-read what they had been told had nowhere to go.
--
-- Stored rather than fetched on demand, for two reasons. A record somebody is
-- told is theirs should not stop existing because a third party pruned an old
-- conversation, and reading a class should not depend on ElevenLabs being up or
-- cost an API call per page view.
--
-- Separate from `session_summaries` on purpose. The summary is small, read on
-- every visit to /progreso, and joined against elsewhere; the transcript is
-- large, read only when somebody opens one class, and is the row a retention
-- policy would delete first. Keeping them apart means a transcript can be
-- dropped without touching the evidence the product is built on.
create table if not exists public.session_transcripts (
  -- The join key everywhere else in this schema, and unique for the same reason
  -- it is unique on session_summaries: a webhook redelivery must update this
  -- row rather than add a second copy of the same class.
  conversation_id text primary key,
  user_id         uuid not null references auth.users (id) on delete cascade,
  created_at      timestamptz not null default now(),
  -- `[{ role, message, at }]`, oldest first. Only those three fields: the
  -- payload also carries tool calls, token counts, latency metrics and model
  -- names, none of which a learner is reading and all of which would make this
  -- row an operational log wearing a learner's name.
  turns           jsonb not null default '[]'::jsonb
);

comment on table public.session_transcripts is
  'What was said in a class, so the learner can read it back. See src/lib/transcripts.ts.';

-- The one query this exists to answer: this learner's classes, newest first.
create index if not exists session_transcripts_user_created_idx
  on public.session_transcripts (user_id, created_at desc);

alter table public.session_transcripts enable row level security;

-- Read-only, own rows. Writes come from the post-call webhook under the service
-- role, which bypasses this; there is no path by which a learner writes their
-- own transcript, and no reason there should be.
drop policy if exists "read own transcript" on public.session_transcripts;
create policy "read own transcript"
  on public.session_transcripts for select
  using (auth.uid() = user_id);
