-- Session memory: what each conversation was about, so the next one can
-- continue it.
--
-- Run against your Supabase project the same way as the init migration:
--   Dashboard -> SQL Editor -> paste -> Run
--   or, with the CLI:  supabase db push
--
-- ElevenLabs writes an automatic summary of every finished conversation.
-- These columns cache it per session row, which is what lets the coach greet
-- a returning learner with their own thread instead of starting cold. The
-- write happens lazily — when the learner next asks for a signed URL — so
-- there is still no cron to run.
--
-- `summary_synced_at` marks rows whose summary has been fetched (even when
-- ElevenLabs had none to give, e.g. a call that never got past hello), so the
-- lazy backfill never refetches the same conversation twice.
alter table public.coach_sessions
  add column if not exists summary          text,
  add column if not exists summary_title    text,
  add column if not exists summary_synced_at timestamptz;

-- No RLS change: the existing "read own sessions" policy already scopes these
-- columns to their owner, and all writes stay with the service role.
