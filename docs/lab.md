# The lab: connecting iajit to modojit

`iajit.vercel.app` is the second surface. This is the contract between the two,
written here because the lab lives in another repository and a contract that
exists only in one half of a system is a contract nobody can check.

## What each one is for

The split is the curriculum's, not an accident of what got built first.

**Level 1 — `tu semana` — the bench, inside modojit.** One task of the
learner's own, one model, no chooser, finished and measured in the class with
the teacher watching every exchange. A room full of models here is the
distraction that level exists to avoid: the learner cannot yet tell them apart,
and the goal is one real thing done and a number that repeats every week.

**Level 2 — `por qué funcionó` — the lab.** `cri-01-contexto`'s proof is the
same task done twice, and the natural sibling is the same request across
several models. Hundreds of models in one conversation is useless in a first
class and is exactly the apparatus this lesson needs. It also gives
`comparativa-chatgpt-claude-gemini.md` something a learner can actually do
rather than only read.

**Levels 3–4 — their own accounts.** See `handoff.ts`: the weekly saving has to
keep working after somebody stops paying us, so the last move is always out of
both of our products and into theirs.

## How a learner gets there

From `/progreso`, on level 2 steps only, carrying the prompt they saved:

    https://iajit.vercel.app/?q=<urlencoded prompt>

`labHandoff()` in `src/lib/handoff.ts` builds it. The prompt is copied to the
clipboard *before* the tab opens, so `?q=` is a convenience and never a
dependency — if the lab ignores it or renames it, the learner pastes and
nothing is broken. A prompt over `MAX_URL_PROMPT` is not put in the URL at all,
because a truncated prompt produces a confident answer to the wrong question.

**What the lab has to do:** read `?q=` and put it in the composer. Not send it —
put it there. The learner is meant to look at it, and often to edit it, which is
the lesson.

## How the practice gets back to the teacher

This is the half that makes it pedagogical rather than two apps sharing a link.

`practiceRecap()` in `src/lib/progress.ts` reads `practice_messages` for rows
with **`session_id is null`** — work done outside a class — since the learner's
last session, and puts one line in the record the teacher opens on:

> Entre clases practicó 6 veces por su cuenta; lo último que pidió fue "…".

So the class can start on what they actually did instead of asking. That is the
same principle the bench was built on: a teacher that has to ask what happened
spends the class reconstructing it.

**What the lab has to write.** One row per turn into `public.practice_messages`,
with the service role:

| column | value |
|---|---|
| `user_id` | `auth.uid()` of the learner — the same person in both apps |
| `session_id` | **null** — this is what marks it as lab practice, not bench |
| `role` | `user` or `assistant` |
| `content` | the message text |
| `provider` / `model` | what actually served it |
| `billed_seconds` | see below |
| `prompt_tokens` / `completion_tokens` / `cost_usd` | if known |

`role` and `session_id` are the two that matter. A lab row written with a
`session_id` disappears into the class's own transcript and the teacher never
sees it as homework; a row with no `role` is invisible to the recap, which
filters on `role = 'user'`.

### Metering

`billed_seconds` is summed by `plan_usage` and `plan_usage_total`, so anything
the lab writes there comes off the same allowance as spoken minutes. Two honest
options, and the choice is commercial rather than technical:

- **Write the real cost** (`secondsForSpend()` in `src/lib/practica.ts`), and
  lab practice competes with class time. Correct if the lab runs on the same
  OpenRouter budget.
- **Write `0`**, and the lab is free practice that never costs somebody a class.
  Correct if you want practice to be unlimited and are willing to pay for it.

There is no third option where it is unmetered and also invisible: an unmetered
path through a paid API is the shape of a bill nobody notices until it arrives.

## The assumption this rests on

**Both apps use the same Supabase project**, so `auth.uid()` identifies the same
person on both sides and the lab can write rows modojit will read.

This was not verifiable from outside — modojit's anon key is not reachable in
its public bundle — so it is recorded here as an assumption rather than a fact.
Confirm it once by comparing `NEXT_PUBLIC_SUPABASE_URL` in both Vercel projects.
iajit's is `lkserdjwmbbqngegldrw.supabase.co`.

If they turn out to be different projects, nothing above works and the fix is
not small: either move one app onto the other's project, or give the lab a
signed token in the deep link carrying the modojit `user_id`, and have it post
transcripts to a modojit endpoint instead of writing to the table directly.
