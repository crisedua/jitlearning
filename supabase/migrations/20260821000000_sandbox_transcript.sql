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
