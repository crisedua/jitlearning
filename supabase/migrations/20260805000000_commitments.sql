-- Commitments: the one thing the learner said they would do, kept as a record
-- rather than as a sentence buried in a transcript.
--
-- Run against your Supabase project the same way as the earlier migrations:
--   Dashboard -> SQL Editor -> paste -> Run
--   or, with the CLI:  supabase db push
--
-- The persona already closes every stretch of conversation on a commitment with
-- three parts: what, by when, and what would count as it having worked. Until
-- now that only existed as spoken words, so the follow-up at the start of the
-- next session depended on ElevenLabs' free-text summary happening to mention
-- it. These columns make the follow-up deterministic, and let the picker page
-- ask about it before a session even starts.
--
-- Extraction is done by ElevenLabs from the transcript (see `dataCollection()`
-- in src/lib/agent.ts), on the same lazy backfill as the summary — still no
-- cron.
--
-- Three text columns rather than a normalised commitment table: there is at
-- most one per session, and a session already has a row here.
alter table public.coach_sessions
  add column if not exists commitment        text,
  -- Deliberately text, not date. The deadline is captured as it was said
  -- ("antes del viernes", "esta semana"), because parsing that into a date is
  -- guesswork and a wrong date shown back to the learner is worse than the
  -- learner's own words. Nothing computes overdue from this; it is quoted.
  add column if not exists commitment_due    text,
  add column if not exists commitment_signal text;

-- No RLS change: the existing "read own sessions" policy already scopes these
-- columns to their owner, and all writes stay with the service role.
