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
