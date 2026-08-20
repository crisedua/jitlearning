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

**The two apps are on different Supabase projects.** modojit is
`kmreloatvnnlieydlfuq`, the lab is `lkserdjwmbbqngegldrw` — confirmed from
modojit's own sign-in redirect. The same person signs into both and gets two
different `auth.uid()`s, so the lab cannot write into this database and there is
no id to join on. Everything below exists because of that.

### The token

The link that opens the lab carries `t=<token>`: an HMAC over `<user_id>.<exp>`
signed with `INGEST_SECRET`, good for eight hours. See `src/lib/lab-token.ts`.
It is not a session. It authenticates a claim about identity made by another
service we run, and the learner still signs into the lab with their own account.

A stolen one can write practice rows for one learner for a few hours. That is
the entire blast radius, and it is why the endpoint below does nothing else — it
cannot grant a plan, spend class minutes, read a transcript, or touch a profile.

**What the lab has to do:** keep `t` from the URL for the session, and send it
back with the turns. If it is absent, everything still works except the report;
practising must never depend on a token being present.

### The endpoint

    POST https://www.modojit.com/api/lab
    Content-Type: application/json

    {
      "token": "<the t from the link>",
      "turns": [
        { "role": "user",      "content": "…", "model": "google/gemini-3.7-flash" },
        { "role": "assistant", "content": "…", "model": "google/gemini-3.7-flash",
          "promptTokens": 812, "completionTokens": 240, "costUsd": 0.0009 }
      ]
    }

Answers `{ "recorded": n }`. Up to 40 turns per call, 20,000 characters each.
Anything without a valid `role` and a string `content` is dropped rather than
rejected, so one malformed turn never costs the rest of a batch.

Send them when a conversation ends, or in batches as it goes — the rows carry no
ordering beyond `created_at`, so either works.

### What modojit does with them

They land in `practice_messages` with **`session_id = null`**, which is what
marks them as work done outside a class. `practiceRecap()` in
`src/lib/progress.ts` reads exactly those rows since the learner's last session
and puts one line in the record the teacher opens on:

> Entre clases practicó 6 veces por su cuenta; lo último que pidió fue "…".

So the class starts on what they actually did instead of asking. Silent at zero.

### Metering

`billed_seconds` defaults to `0`, and the endpoint only honours a number the lab
sends explicitly. Zero means lab practice never eats class minutes, which is
right while the lab runs on its own OpenRouter budget.

If that changes and you want practice to compete with class time, send
`billedSeconds` per assistant turn — `secondsForSpend()` in
`src/lib/practica.ts` is the conversion modojit uses. It is capped at an hour
per turn here, because this number comes off a learner's allowance and arrives
from outside.

## Checking it works

    curl -s -X POST https://www.modojit.com/api/lab \
      -H "Content-Type: application/json" \
      -d '{"token":"<paste a t from a real link>","turns":[{"role":"user","content":"prueba"}]}'

`{"recorded":1}` means the whole path is live. `401` means the token is expired,
forged, or signed with a different `INGEST_SECRET` than the deployment holds.
