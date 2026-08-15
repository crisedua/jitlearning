# ModoJIT

A study partner by voice, in Spanish. It asks you questions, listens to your
answer, and tells you where you failed and what to review. Most people use it
while walking or driving, which is the constraint behind every design decision
here: short turns, nothing to read, no course to sit through.

**Two coaches.**

| Coach | For | Corpus |
|---|---|---|
| `pmp` | Preparing for the PMI PMP exam by drilling situational questions out loud | `knowledge/pmp/` |
| `empleabilidad` | Career orientation for people out of work, afraid of losing the job, or still studying: what to learn next to raise their opportunities as AI changes their field | `knowledge/empleabilidad/` |

**The corpus is a supplement, not a fence.** Both coaches answer from the
model's general knowledge and use retrieved material to sharpen specifics. This
reverses an earlier design in which a coach could not answer outside its
corpus, and which therefore said "no tengo material sobre eso" to ordinary
questions. What replaces the fence is the honesty rule in the persona:
attribute only what was retrieved, say plainly when an answer is general
criterion, and never attach a figure, author, year or course name to something
merely recalled. `npm run doctor` checks that rule is still in every persona.

Built on the [ElevenLabs Agents Platform](https://elevenlabs.io/docs/eleven-agents):
ElevenLabs handles speech-to-text, the LLM turn, text-to-speech, chunking,
embedding and vector retrieval. This repo is the ingestion backend, the agent
configuration, and the UI around it.

One ElevenLabs agent per coach, so the attachment list is the corpus boundary:
a PMP question cannot retrieve employability material, because those chunks are
not attached to that agent.

**The knowledge side is stateless.** ElevenLabs holds the documents and their
indexes; the agent's own config records which documents are attached and in
which mode. Any number of Vercel instances see identical state.

**Supabase holds the people.** Sign-in, profiles, plans, and one row per coach
session — see [Accounts, plans and usage](#accounts-plans-and-usage). Nothing
about the corpus lives there, so the two halves fail independently: a Supabase
outage stops new sign-ins, it does not touch retrieval.

## Ingesting the corpora

Documents are stored as `<folder>/<file>`, and that prefix is what assigns them
to a coach (`sources` in `src/lib/coaches.ts`). So the folder a file sits in
decides which coach can retrieve it.

```bash
# Everything, both coaches
npm run ingest -- ./knowledge

# One coach at a time
npm run ingest -- ./knowledge/pmp
npm run ingest -- ./knowledge/empleabilidad
```

`knowledge/_retired/` holds the corpora of the coaches this product no longer
runs. Those files stay on disk and are skipped by ingestion; nothing there is
attached to any agent.

After ingesting, push personas and attachment lists to the live agents:

```bash
npm run sync:agent                    # report drift for every coach
npm run sync:agent -- --push          # apply
npm run sync:agent -- pmp --push      # one coach
```

## Feeding knowledge from your backend

This is the endpoint that matters. Three source types, one route:

```bash
# From a URL
curl -X POST https://<app>.vercel.app/api/knowledge \
  -H "x-ingest-secret: $INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://docs.internal/runbook", "name": "Deploy runbook"}'

# From raw text
curl -X POST https://<app>.vercel.app/api/knowledge \
  -H "x-ingest-secret: $INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"text": "Rollbacks run through deploy.sh --rollback ...", "name": "Rollback notes"}'

# From a file
curl -X POST https://<app>.vercel.app/api/knowledge \
  -H "x-ingest-secret: $INGEST_SECRET" \
  -F "file=@./handbook.pdf"
```

Returns `201` with the document id and its initial index status.

**Indexing is asynchronous.** A document is not retrievable the moment upload
returns — ElevenLabs chunks and embeds it in the background. Poll until it
succeeds, then attach it:

```bash
# Poll — repeat until {"status":"succeeded"}
curl https://<app>.vercel.app/api/knowledge/$DOC_ID \
  -H "x-ingest-secret: $INGEST_SECRET"

# Attach every ready document to the coach
curl -X POST https://<app>.vercel.app/api/agent \
  -H "x-ingest-secret: $INGEST_SECRET"
```

`Authorization: Bearer $INGEST_SECRET` works anywhere `x-ingest-secret` does.

### Routes

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/knowledge` | GET | secret | Catalog with index + attachment state |
| `/api/knowledge` | POST | secret | Ingest file / url / text |
| `/api/knowledge/[id]` | GET | secret | Index status (poll target) |
| `/api/knowledge/[id]` | POST | secret | Retry a failed index |
| `/api/knowledge/[id]` | DELETE | secret | Delete and detach |
| `/api/agent` | GET | secret | Per-coach status and attached document names (`?coach=` to narrow) |
| `/api/agent` | POST | secret | Re-attach ready documents to every coach (`?coach=` to narrow) |
| `/api/agent/provision` | POST | secret | Create one coach's agent — `?coach=` required |
| `/api/health` | GET | secret | Config diagnostics: key, scope, every agent, sign-in |
| `/api/signed-url` | GET | learner session | Short-lived WebSocket URL, opens a usage row |
| `/api/sessions/[id]` | POST | learner session | Closes their own usage row when a call ends |
| `/auth/login` | GET | open | Starts the Google handshake (sets the PKCE cookie) |
| `/auth/callback` | GET | open | Supabase OAuth return: creates the session |

## Deploying to Vercel

You never need the ElevenLabs key on your own machine — the agent can be created
from the deployed app, using the key already in Vercel's environment.

```bash
npx vercel                     # deploy
```

Set these in **Project Settings → Environment Variables**, then redeploy:

- `ELEVENLABS_API_KEY` — your key, with Conversational AI read+write
- `INGEST_SECRET` — `openssl rand -hex 32`
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — sign-in
- `SUPABASE_SERVICE_ROLE_KEY` — profiles and usage; see
  [Learners: Supabase Auth with Google](#learners-supabase-auth-with-google)

Create one agent per coach by calling the deployed app:

```bash
for c in pmp empleabilidad; do
  curl -X POST "https://<app>.vercel.app/api/agent/provision?coach=$c" \
    -H "x-ingest-secret: $INGEST_SECRET"
done
# -> {"coach":"pmp","agentId":"agent_...","created":true}
```

Set each returned id as that coach's `ELEVENLABS_AGENT_ID_*`, redeploy once
more, then confirm the whole deployment is wired correctly:

```bash
curl https://<app>.vercel.app/api/health -H "x-ingest-secret: $INGEST_SECRET"
```

`{"ready": true}` means the key authenticates, carries the right scope, and
every coach's agent exists carrying only its own documents. Anything false
names which check failed and for which coach.

### Local development (optional)

If you'd rather work locally, put the same values in `.env.local` and run
`npm run setup:agent` instead of the provision endpoint.

### Environment variables

| Variable | Required | Notes |
|---|---|---|
| `ELEVENLABS_API_KEY` | yes | Needs Agents + Knowledge Base read/write |
| `ELEVENLABS_AGENT_ID_PMP` | yes | From `npm run setup:agent -- pmp` |
| `ELEVENLABS_AGENT_ID_EMPLEABILIDAD` | yes | One agent per coach: the attachment list is what scopes the corpus |
| `ELEVENLABS_AGENT_ID_PMP_MAX_VECTOR_DISTANCE` | no | Per-coach retrieval threshold; overrides `maxVectorDistance` in `coaches.ts` |
| `ELEVENLABS_AGENT_ID_EMPLEABILIDAD_MAX_VECTOR_DISTANCE` | no | Same, for the other coach |
| `INGEST_SECRET` | yes | `openssl rand -hex 32` |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Public key; safe in the browser |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | **Secret.** Server-only; bypasses RLS |
| `NEXT_PUBLIC_SITE_URL` | no | Only when the host header isn't the public URL |
| `ELEVENLABS_VOICE_ID` | no | Defaults to a neutral Latin-American Spanish voice |
| `ELEVENLABS_AGENT_LLM` | no | Blank = workspace default |
| `ELEVENLABS_EMBEDDING_MODEL` | no | Set before indexing anything |

Beyond the Supabase project itself, nothing to provision — no volume, no cron.
`npm run sync:usage` is worth scheduling once there is real traffic, but the app
is correct without it.

### Bulk loading

For a large initial corpus, run against the ElevenLabs API directly rather than
through the deployed app. This blocks until every document is queryable, so it
is safe in a provisioning or CI step and avoids the serverless timeout:

```bash
npm run ingest -- ./docs
```

Re-running it on a folder replaces documents rather than duplicating them, so
editing a file and re-ingesting is the normal loop.

**Documents are stored as `<carpeta>/<archivo>`, and that prefix is the corpus
boundary.** ElevenLabs keeps no folder of its own — a document is its name and
nothing else — so the prefix is the only thing telling `attachableEntries()`
which coach may retrieve a document. `npm run ingest` writes it for you, from
either `./knowledge` or a single folder inside it.

A document whose name carries no prefix matching some coach's `sources` is
attached to nobody. It uploads and indexes without complaint, and the only
symptom is a coach saying it has no material on its own subject. The ingest
script warns about such orphans by name, and `/api/health` fails the check for
any agent carrying a document outside its corpus.

## Auth model

Every knowledge and agent route requires `INGEST_SECRET`, compared in constant
time. Routes **fail closed** — if the variable is unset they return `503` in
every environment, including local development. Security that behaves
differently in dev than in production is how things ship open by accident.

The Knowledge UI prompts for the secret and keeps it in `sessionStorage`, so it
dies with the tab.

### Learners: Supabase Auth with Google

Learners never see the ingest secret. `/coach` and `/api/signed-url` are behind
a Supabase session instead. Both are gated, not just the page: `/api/signed-url`
is what mints the billable credential, and it is a plain GET anyone could call
directly.

Any Google account is accepted. The gate is there so every billable
conversation has an identified person behind it, not to curate access. To
curate it, filter in `currentUser()` in
[`src/lib/supabase/server.ts`](src/lib/supabase/server.ts) or set the allowed
domains in Supabase itself — every gate reads the same session.

**Setup, once:**

1. Create a Supabase project. From **Project Settings → API**, copy
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
   `SUPABASE_SERVICE_ROLE_KEY`.
2. **Authentication → Providers → Google**: enable it and paste a Google OAuth
   client id and secret. In the Google Cloud console (**APIs & Services →
   Credentials → OAuth client ID → Web application**) the authorized redirect
   URI is Supabase's, not this app's:
   `https://<your-project>.supabase.co/auth/v1/callback`
3. **Authentication → URL Configuration**: add `http://localhost:3000/**` and
   `https://<app>.vercel.app/**` as redirect URLs.
4. Run [`supabase/migrations/`](supabase/migrations/) in the SQL editor.

`/api/health` and `npm run doctor` both report which of these is missing.

Sessions are cookie-based and refreshed in [`src/middleware.ts`](src/middleware.ts)
— without that refresh, Server Components would silently drop rotated tokens
and learners would be signed out mid-session.

## Accounts, plans and usage

The schema is in [`supabase/migrations/`](supabase/migrations/):

| Table | What it holds |
|---|---|
| `profiles` | One row per `auth.users` id — email, name, avatar, `plan_id`. Created by a trigger on sign-up, refreshed from Google on every sign-in. |
| `plans` | `free` by default. `monthly_minutes` / `monthly_sessions`, both nullable, where null means unlimited. |
| `coach_sessions` | One row per signed URL minted: who, which agent, conversation id, duration, message count, credits — plus the conversation's summary, which is what session memory replays. |

RLS is on for all three, and every policy is scoped to `auth.uid()` — a learner
can read their own profile and their own sessions, and nothing else. There are
no insert or update policies at all: name and avatar come from Google, plan is a
billing decision, and minutes must not be writable by the browser that reports
them. All of those writes go through the service-role client in
[`src/lib/supabase/admin.ts`](src/lib/supabase/admin.ts).

**Limits are enforced at mint time.** `checkPlanAllowance()` in
[`src/lib/account.ts`](src/lib/account.ts) reads the `plan_usage` view inside
[`/api/signed-url`](src/app/api/signed-url/route.ts), before `getSignedUrl` —
the single chokepoint through which every billable conversation passes. A
learner over their plan's minutes or sessions gets a 403 with a plain sentence
instead of a credential. The check fails open (no view, no Supabase → the coach
still answers) and never cuts off a session already running, so the cap is soft
by about one session's length.

### Where the usage numbers come from

A row opens when the signed URL is minted, and the browser closes it over
`POST /api/sessions/[id]` with the conversation id, duration and turn count.
That is self-reported: a closed laptop reports nothing, and a hostile tab could
report anything.

```bash
npm run sync:usage
```

overwrites those numbers with ElevenLabs' own and stamps `usage_synced_at`. A
row with that stamp is a receipt; a row without one is an estimate. Do not bill
anyone off an unsynced row.

### Session memory

A learner can log out, come back days later, and the coach picks up the thread
— including asking whether they did the thing they committed to, which is the
difference between coaching and advice.

No LLM of ours writes anything: ElevenLabs already summarises every finished
conversation. When `/api/signed-url` mints a new session,
[`learnerContext()`](src/lib/memory.ts) reads the learner's recent
`coach_sessions` rows, fetches any summaries not yet cached (bounded, so a
start never waits on more than two), stores them on the rows, and returns the
last three as a context block. The browser sends that block through
`sendContextualUpdate` alongside the date and the session objective, and the
persona's *Continuidad entre sesiones* section says how to use it: follow up
on the commitment early, never recite the summary, and follow the person if
they bring a different topic today.

Run [`supabase/migrations/20260802000000_session_memory.sql`](supabase/migrations/20260802000000_session_memory.sql)
to add the summary columns. Until it has run, memory still works — summaries
are fetched from ElevenLabs live on every start instead of cached — so the
migration is a cost optimisation, not a feature flag. Deleting a conversation
at ElevenLabs before its summary is cached forgets that session; after, the
cached copy survives.

### Study memory

The summaries above are ElevenLabs' free-text paragraphs, which is enough to
open a session warmly and not enough to teach from. Two structured tables sit
beside them, filled from the per-coach extraction fields in
[`dataCollection()`](src/lib/agent.ts):

| Table | What it holds |
|---|---|
| `session_summaries` | One row per finished session: exam or target date, weak areas, which questions were asked and which were missed, and the commitment. |
| `career_profiles` | One row per learner: role, field, years, weekly tasks, tools, goal, the map they were given and the plan built from it. |

[`studyContext()`](src/lib/study.ts) turns those into the block sent through
`sendContextualUpdate` at the start of a session, capped at 800 characters
because it competes with the persona for the same turn. It is what lets PMP bias
the next set of questions toward the domains missed last time, and what lets the
employability coach open on the step of the plan the learner is actually on.
`isFirstSession()` sets `first_session`, which is how a coach knows to run the
diagnostic instead of the follow-up.

Run [`supabase/migrations/20260808000000_study_memory.sql`](supabase/migrations/20260808000000_study_memory.sql).
RLS is on and every policy is scoped to `auth.uid()`. Reads fail soft on a
missing table or column, so a deployment without the migration behaves like one
without memory rather than erroring.

### Commitments

The follow-up above used to be a coin flip. The commitment lived only in the
free-text summary, so the coach asked about it when ElevenLabs happened to keep
it and silently didn't when it didn't — for the one behaviour the product sells
hardest.

It is now extracted as a field.
[`dataCollection()`](src/lib/agent.ts) declares three of them on every agent —
the action, the deadline as it was said, and the signal that would count as it
having worked, which are exactly the three parts the persona demands. ElevenLabs
fills them in when it analyses the call, so there is still no LLM of ours;
[`commitments.ts`](src/lib/commitments.ts) stores them on the same lazy
backfill as the summary and returns the most recent one, which is what the
picker at `/coach` shows before you choose anything and what
[`learnerContext()`](src/lib/memory.ts) puts at the top of the next session's
context.

There is deliberately **no completion column**. Nothing could set it honestly:
the learner reports back out loud, mid-conversation, and a checkbox would invite
marking something done without doing it — the exact failure this is aimed at. A
commitment stops being shown when a newer session produces one.

Run [`supabase/migrations/20260805000000_commitments.sql`](supabase/migrations/20260805000000_commitments.sql)
for the columns, and `npm run sync:agent -- --push` so the agents carry the
extraction fields. Both degrade quietly: without the migration the reads and
writes are skipped and nothing else changes, and an agent provisioned before
this existed picks the fields up on its next sync.

## Tuning retrieval

The knobs live in `ragConfig()` in [`src/lib/agent.ts`](src/lib/agent.ts):

- **`max_vector_distance`** (0.8 by default) is the relevance gate and the
  setting that matters most. Set too tight and the coach retrieves nothing,
  answering from general knowledge instead. That is now a legitimate answer
  rather than a failure, which is exactly why the threshold still matters: the
  learner loses the specific material without anything sounding wrong. At 0.6, a
  question about a study already in the model's training produced invented
  figures plus a statistic the source never contained. Raise it past 0.8 only
  while watching for the opposite failure: loosely related chunks answered from
  as if they were on point.

  Tune it against questions whose answers you can check by hand, and include at
  least one on a topic the model likely knows independently. Questions only your
  corpus can answer will pass at almost any threshold and tell you nothing.

  It is set **per coach**, because the corpora do not behave alike. PMP material
  is terminology-dense and phrased almost identically across sources, so it sits
  at 0.7 to keep near-duplicates from crowding out the chunk that answers the
  question. `maxVectorDistance` in [`src/lib/coaches.ts`](src/lib/coaches.ts) is
  the default; `<ENVKEY>_MAX_VECTOR_DISTANCE` overrides it without a deploy.
- **`max_retrieved_rag_chunks_count`** (12) and **`max_documents_length`**
  (12,000 tokens) — retrieval budget. Larger mostly buys latency, which is felt
  much more sharply in voice than in text.
- **`embedding_model`** — `e5_mistral_7b_instruct` is English-first. Switch to
  `multilingual_e5_large_instruct` for non-English corpora. Changing it later
  means re-indexing every document.

### Choosing the agent LLM

`ELEVENLABS_AGENT_LLM` accepts these Claude identifiers (verified against the
live API — an unrecognised value is **silently ignored** and ElevenLabs falls
back to `gemini-2.5-flash`, so check `/api/health` after changing it):

```
claude-sonnet-4-5   claude-sonnet-4-6   claude-opus-4-7
claude-haiku-4-5    claude-sonnet-4     claude-3-7-sonnet
```

Leave the variable unset and you get the ElevenLabs workspace default rather
than a Claude model.

The persona is built by `personaFor()` in the same file and returned by
`tutorSystemPrompt(coach)`: one shared base plus the coach's own session spine
from [`src/lib/coaches.ts`](src/lib/coaches.ts). Written for voice, so turns run
to at most 3 sentences and nothing is read aloud that only makes sense on a
page. See [What the coaches are for](#what-the-coaches-are-for).

### `auto` vs `prompt` usage mode

| Mode | Behavior | Use for |
|---|---|---|
| `auto` (default) | Retrieved via RAG only when relevant | Everything. Scales to large corpora. |
| `prompt` | Pinned into the system prompt every turn | Short, always-needed context only |

`prompt` mode costs tokens on *every* turn, so reserve it for things like a
glossary of internal acronyms. Pass `"usageMode": "prompt"` on upload, or tick
"Always in context" in the UI.

## What the coaches are for

**PMP** runs the same shape every session: ask the exam date and say how many
days are left, put one PMI-style situational question with 4 options, correct
the answer naming the domain and task from the Examination Content Outline,
explain in at most 3 sentences why the best answer is best and why the most
tempting distractor is wrong, repeat 3 to 5 times biased toward the domains
missed last time, and close on a commitment. Where PMI's expected answer
differs from what an experienced project manager would actually do, the coach
says so out loud, because that gap is where most of the score is lost.

**Empleabilidad con IA** starts with a diagnostic: role or degree, field,
years, the 3 to 5 tasks that fill the week, tools already used, and the goal.
Then it gives the map before any plan: where the learner's existing knowledge
gains value, what categories of tool exist and what each unlocks for their
tasks, and 3 paths from closest to farthest. Later sessions are lessons anchored
to one of the learner's own weekly tasks, never a tool in the abstract: the
concept in 2 sentences, the exact steps at voice pace, the verification habit,
and an exercise. It asks whether the learner is at a computer or walking and
teaches differently for each. It is career and technical guidance, not interview
rehearsal.

Both close every session the same way: 1 action, 1 date, 1 signal that confirms
it worked. The next session opens by asking about it.

### Why not just use ChatGPT

Every visitor is asking this, so it is worth being able to answer it in
behaviour rather than in adjectives. Most of the persona is *prohibitions* —
don't invent figures, don't deny features from memory, don't dictate click
paths. Those keep the coach from being **worse** than a general assistant. None
of them make it better than one.

Four sections do the differentiating, each one checkable in a single
conversation and each one something a general assistant structurally cannot do
with this corpus:

- **It names the source out loud, mid-sentence.** "This is Kagan, in *Million
  Dollar Weekend*." The corpus carries its attributions inside the prose, so the
  retrieved chunk has the author in it. A general model recalls the same ideas
  unsourced and — the part that matters — cannot tell you which of the two it is
  doing. The persona also forbids attributing anything the material didn't
  attribute: a false citation is worse than none, because it is what the learner
  repeats in their next meeting.
- **It refuses to average the authors.** The corpus has an explicit contrast
  document ([`08-errores-y-desacuerdos.md`](knowledge/negocio/08-errores-y-desacuerdos.md))
  recording where Kagan, Martell and Abdaal genuinely disagree — validate in 48
  hours versus build slowly over years while keeping your job. Consensus
  smoothing is the default failure of a summarising model, and it deletes
  exactly the information that decides what someone should do. The persona names
  both positions, picks one for *this* person, and says what would flip it.
- **It closes on a commitment.** One action, a date, and what signal would count
  as it having worked — the cheapest test that resolves the biggest doubt, not
  the most thorough plan. One thing, not three: a list of next steps is
  forgotten whole.
- **It doesn't sound like a chatbot.** No "great question", no "hope that
  helps", no "ultimately it depends on you". That register is the most
  recognisable tell there is, and removing it costs nothing.

The first three were promised on the marketing page before anything in the
prompt asked for them. If you drop one from the persona, drop it from
`DIFFERENCES` in [`src/lib/site.ts`](src/lib/site.ts) in the same change — that
list is a set of claims a visitor can falsify in one session.

**The date is injected from the browser**, in
[`VoiceTutor`](src/components/VoiceTutor.tsx), alongside the learner's stated
objective. Without it the commitment step degrades: a model has no clock, so it
either invents a date or retreats to "this week", which is the vagueness the
commitment exists to remove.

### Pushing a persona change

The persona is source code, but each agent holds its own copy: editing
`personaFor()` or a coach's `sessionSpine` changes nothing audible until it is
pushed.

```bash
npm run sync:agent            # report drift, change nothing
npm run sync:agent -- --push  # apply
```

Dry by default: it writes to a live agent that someone may be mid-conversation
with. The same call re-attaches every indexed document, because the prompt and
the knowledge list go up in one PATCH and are not separable.

`POST /api/agent` on a deployment does the same thing, but requires shipping the
change before you can hear it.

## Layout

```
src/lib/elevenlabs.ts   Typed REST client (knowledge base, RAG, agents, signed URLs)
src/lib/knowledge.ts    Ingestion + index status
src/lib/catalog.ts      Assembles document state from ElevenLabs + agent config
src/lib/agent.ts        Persona, RAG config, data collection, knowledge sync
src/lib/coaches.ts      The two coaches: scope, corpus prefixes, session spines
src/lib/study.ts        Session summaries and career profiles, for continuity
src/lib/auth.ts         Shared-secret gate
src/lib/config.ts       Env config + bounded-concurrency helper
src/app/api/            Route handlers
src/components/         VoiceTutor, KnowledgeManager, KnownTopics
src/lib/site.ts         Landing-page copy, incl. the falsifiable DIFFERENCES list
scripts/                setup-agent, sync-agent, bulk ingest, doctor
```

## Known limits

- **Topic grouping and session history were dropped** when the app went
  stateless — both needed a database. RAG relevance handles scoping in
  practice. If you want them back, Vercel KV is the smallest addition.
- **The catalog fans out one status request per document**, capped at 8
  concurrent. Past a few hundred documents, paginate the list route.
- **Corpus isolation is per-agent, not per-workspace.** Each coach attaches only
  the documents matching its `sources` prefixes, so one coach cannot retrieve
  another's material. The documents themselves are still workspace-wide, so any
  agent you create by hand *could* be pointed at them — fine for coaches we own,
  not sufficient for a client's private corpus, which needs its own workspace.
- **Voice needs HTTPS.** Fine on Vercel and on `localhost`; a plain-HTTP host
  will silently fail to get mic access.
- **Procedural steps come from general knowledge, not the corpus.** The
  employability coach's job includes saying which menu to open and what to type,
  and no corpus here documents anyone's interface. So those steps come from the
  model, are subject to the honesty rule like anything else, and go stale when a
  vendor moves a button. The persona keeps them at voice pace and pairs each one
  with a way to check the result, which is what makes a wrong step recoverable.
- **Memory is per-deployment-with-Supabase, and only as good as the
  summaries.** Session memory (see [Session memory](#session-memory)) needs the
  service role to read the ledger — a deployment without Supabase starts every
  conversation cold, as before. The summaries themselves are ElevenLabs'
  automatic ones: a paragraph per call, usually in English, with no control
  over what they keep. Nuance does not survive; the commitment no longer relies
  on it, since it is extracted as its own field (see [Commitments](#commitments)).
- **The persona is long** (9.2k characters for PMP, 13.6k for employability)
  and rides on every turn. `npm run doctor` fails it past 15k. It is a system prompt, so it caches, but a materially larger one
  will start to be felt as latency in voice, where it is much more noticeable
  than in text.
