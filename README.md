# ModoJIT

A voice teacher, in Spanish, for people who need to learn to work with AI before
it works without them.

**The first session ends with a real task from your week finished, and the time it
saves measured.** Four questions, two minutes on what never goes in a chat, then
the task itself, done with you on your own data. Before starting, the teacher asks
how long it usually takes; when you finish, how long it took. The difference is
the product's only claim about its own value, and it recurs every week because the
task does.

The map and the plan come after that, because they cost far less to believe once
something of yours has visibly worked. From there it teaches one lesson per
session on your own tasks, remembers everything between sessions, and closes each
one on 1 action with 1 date and 1 signal.

### Why that order

The obvious order is the wrong one. This opened with six lessons of fundamentals
and reached the learner's own work at step 7 of 11, so a first session ended with
a plan, the free tier ran out somewhere around the diagnostic, and the only thing
a trial could deliver was a promise of future value. That is a vitamin. The
retired `negocio` corpus in this repo has a whole document on *dolores no
vitaminas*; the product was on the wrong side of it.

One fixed lesson stays in front of the work, and it is a safety constraint rather
than a preference: the next thing that happens is a learner pasting a real work
document into a chat window, so the two minutes on what never goes in there is
worth nothing afterwards.

**Voice is the classroom; the site is the notebook.** Most people listen while
they walk or drive, so every design decision keeps turns short and pushes
anything visual or persistent to [`/progreso`](src/app/progreso/page.tsx): the
map, the plan by level, the evidence, the history. Eleven steps read aloud is
nothing anyone retains.

## The curriculum

Defined once, as data, in [`src/lib/curriculum.ts`](src/lib/curriculum.ts). The
persona receives a compact rendering of it, the landing page renders it, the
progress page renders it, and `buildPlan` turns it into the learner's own steps.
One source of truth, so the syllabus somebody read before paying is the syllabus
they get.

| Level | What | Personalised |
|---|---|---|
| 1 Tu semana | The privacy guardrail, then 1 lesson per weekly task, 3 to 5 of them, each ending in the finished output and the two numbers | The tasks do not exist before the diagnostic |
| 2 Por qué funcionó | 5 fixed lessons on the criterion behind what already worked: context, asking well, verifying, what not to delegate, the landscape | No |
| 3 De tarea a flujo | 5 written lessons (chaining, automation, agents, data, building), of which the learner does the ones matching their chosen path | Selection |
| 4 Portafolio | Assemble the proofs, then rehearse telling it in 90 seconds | Entirely |

Every lesson names a proof: an artifact the learner can show. That is this
product's definition of progress. A step marked done with no evidence is a step
to ask about again. Level 1 steps name two more things, the minutes before and
after, which is where the value claim comes from.

### The number

`timeSaved()` in [`progress.ts`](src/lib/progress.ts) sums before minus after over
*finished* weekly tasks. It leads the next session out loud, headlines
[`/progreso`](src/app/progreso/page.tsx), and is what the pricing page points at
instead of making a claim of its own.

Three things keep it honest:

- **Both numbers come from the learner.** The extractor is told not to estimate
  either one, and each is bounded at 40 hours in the schema and again in the
  parser. One misheard number would otherwise put hundreds of saved hours on the
  page, and that costs you every other number on it.
- **Only finished tasks count.** A task measured and left pending is a measurement
  of an experiment, not of a change to somebody's week.
- **There is no cumulative total.** Weekly saving times weeks elapsed would be the
  biggest number on the page and the least defensible. The page shows the
  recurring figure with every contributing task listed under it, so the total can
  be audited rather than believed.

Run [20260812000000_hours_saved.sql](supabase/migrations/20260812000000_hours_saved.sql)
for the two columns and the `weekly_minutes_saved` view. `npm run doctor` fails
without them, because the teacher asks for both numbers whether or not there is
anywhere to put them.

## The knowledge model

**The corpus is a supplement, not a fence.** The teacher answers from the
model's general knowledge; `knowledge/empleabilidad/` sharpens specifics when
it happens to be relevant, and the product works with that folder empty. This
reverses an earlier design in which a coach could not answer outside its corpus
and therefore said "no tengo material sobre eso" to ordinary questions.

What replaces the fence is the honesty rule in the persona, and
`npm run doctor` fails when any part of it falls out of the prompt:

- Attribute only what was retrieved. Say plainly when an answer is general
  criterion. Never attach an author, study, percentage or year to something the
  model merely knows.
- No figures without a retrieved source. Directions and trends are fine.
- Well-known tools may be named from general knowledge (ChatGPT, Claude,
  Gemini, Copilot, Excel, Power BI, Python, Claude Code). Course titles, prices
  and durations only if retrieved.
- Never promise a job.
- **It looks things up rather than guessing.** Anything that depends on the
  present — a price, what a field's job ads are asking for, whether a product
  still works the way it was described — goes through the lookup tool rather
  than through the model's memory. Asked for something current, the teacher
  announces the search, runs it, and cites what came back.

## The lookup

[`/api/ask`](src/app/api/ask/route.ts) is an ElevenLabs server tool backed by
Claude Opus 5 with the `web_search` tool ([`consulta.ts`](src/lib/consulta.ts)).
The agent calls it mid-conversation; it returns at most 3 sentences plus the
sources.

**The sources cannot be fabricated.** They are read out of the response's
`web_search_tool_result` blocks — what the search engine returned — not out of
the model's prose. The one thing a language model is worst at, remembering a URL,
is the one thing this never asks it for. URLs are not even handed back to the
agent, only titles: a URL read aloud is noise.

Three things this costs, all of them deliberate:

- **Latency.** A search-backed answer takes several seconds, which in a voice
  call is a long silence. The tool's `response_timeout_secs` is 30, the route's
  `maxDuration` clears it, and the persona announces the lookup before calling so
  the wait reads as a teacher checking rather than a bug. `effort` is `low`,
  which on Opus 5 is the difference between an 8-second answer and a 30-second
  one at little cost in quality.
- **Money.** Every call is an Opus 5 turn plus up to 4 billed searches, which is
  why this route is gated by `INGEST_SECRET` (sent by ElevenLabs as a static
  header) while the older public read-only tool was not.
- **Thinking stays on.** Disabling it on Opus 5 can put a tool call into the
  visible text instead of a tool block, and for a search tool that means the
  search silently never runs and the turn still looks successful.

```bash
npm run setup:tools            # report what would change
npm run setup:tools -- --push  # register the tool and attach it to the agent
```

`npm run doctor` fails when no tool is attached, because the persona promises a
search it would otherwise be unable to run.

Built on the [ElevenLabs Agents Platform](https://elevenlabs.io/docs/eleven-agents):
ElevenLabs handles speech-to-text, the LLM turn, text-to-speech, chunking,
embedding and vector retrieval. This repo is the ingestion backend, the agent
configuration, the memory, and the UI around it.

**The knowledge side is stateless.** ElevenLabs holds the documents and their
indexes; the agent's own config records which documents are attached and in
which mode. Any number of Vercel instances see identical state.

**Supabase holds the people.** Sign-in, profiles, plans, and one row per coach
session — see [Accounts, plans and usage](#accounts-plans-and-usage). Nothing
about the corpus lives there, so the two halves fail independently: a Supabase
outage stops new sign-ins, it does not touch retrieval.

## Ingesting the corpus

Optional. The teacher works without any of it. What the corpus buys is that a
specific claim can be attributed out loud instead of being labelled general
criterion.

Documents are stored as `<folder>/<file>`, and that prefix is what decides
whether a document is attachable at all: only names matching `TEACHER.sources`
(`empleabilidad/`) reach the agent.

```bash
npm run ingest -- ./knowledge/empleabilidad   # the live corpus
npm run ingest -- ./knowledge                 # same thing, skipping _retired/
```

`knowledge/_retired/` holds the corpora of the four subjects this product no
longer teaches (project management, AI in business, AI in schools, starting a
business). Those files stay on disk, are skipped by ingestion, and match no
prefix, so nothing there can be retrieved.

**Anything added later must carry its emitter, year and URL inside the
document.** The persona may only attribute what it retrieved, so a figure in a
document with no source attached is a figure the teacher can quote and cannot
justify.

After ingesting, push the persona and the attachment list to the live agent:

```bash
npm run sync:agent            # report drift for the agent
npm run sync:agent -- --push  # apply
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

# Attach every ready document to the agent
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
| `/api/agent` | GET | secret | Agent status and attached document names |
| `/api/agent` | POST | secret | Re-attach ready documents and push the persona |
| `/api/agent/provision` | POST | secret | Create the agent |
| `/api/health` | GET | secret | Config diagnostics: key, scope, agent, corpus, sign-in |
| `/api/signed-url` | GET | learner session | Short-lived WebSocket URL, the dynamic variables, opens a usage row |
| `/api/sessions/[id]` | POST | learner session | Closes their own usage row when a call ends |
| `/api/webhooks/elevenlabs` | POST | HMAC signature | Post-call analysis becomes the profile, the plan and the session row |
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

Create the agent by calling the deployed app:

```bash
curl -X POST https://<app>.vercel.app/api/agent/provision \
  -H "x-ingest-secret: $INGEST_SECRET"
# -> {"agentId":"agent_...","created":true}
```

Set the returned id as `ELEVENLABS_AGENT_ID`, redeploy once more, then confirm
the whole deployment is wired correctly:

```bash
curl https://<app>.vercel.app/api/health -H "x-ingest-secret: $INGEST_SECRET"
```

`{"ready": true}` means the key authenticates, carries the right scope, and the
agent exists carrying only documents from the live corpus. Anything false names
which check failed.

### Local development (optional)

If you'd rather work locally, put the same values in `.env.local` and run
`npm run setup:agent` instead of the provision endpoint.

### Environment variables

| Variable | Required | Notes |
|---|---|---|
| `ELEVENLABS_API_KEY` | yes | Needs Agents + Knowledge Base read/write |
| `ELEVENLABS_AGENT_ID` | yes | From `npm run setup:agent`. One product, one agent |
| `ELEVENLABS_WEBHOOK_SECRET` | for memory | Signing secret for the post-call webhook. Without it the plan never advances on its own |
| `ELEVENLABS_MAX_VECTOR_DISTANCE` | no | Retrieval threshold, overriding `TEACHER.maxVectorDistance` without a deploy |
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

**Documents are stored as `<carpeta>/<archivo>`, and that prefix is what makes a
document attachable.** ElevenLabs keeps no folder of its own: a document is its
name and nothing else, so the prefix is the only thing telling
`attachableEntries()` whether a document belongs to the live corpus.
`npm run ingest` writes it for you.

A document whose name matches no prefix in `TEACHER.sources` is attached to
nobody. It uploads and indexes without complaint, and the only symptom is a
teacher that never cites its material. The ingest script warns about such
documents by name, and both `/api/health` and `npm run doctor` fail when the
agent is carrying one.

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
| `career_profiles` | One row per learner: role, field, sector, years, weekly tasks, tools, goal, chosen path, and the map as it was given to them. |
| `plan_steps` | Their own plan, one row per step: lesson, level, linked task, status, evidence, commitment, position. |
| `session_summaries` | One row per finished session: which lesson, what was taught, the commitment and whether it was kept. |

RLS is on for all of them, and every policy is scoped to `auth.uid()`: a learner
reads their own rows and nothing else. Insert is never granted, and update is
granted on exactly two things, both of which only the learner can know: whether
a commitment was kept, and what they built. Step status stays a function of what
was taught and shown out loud, because a plan you can tick into "done" measures
nothing. Every other write goes through the service-role client in
[`src/lib/supabase/admin.ts`](src/lib/supabase/admin.ts).

`npm run doctor` probes the three memory tables from both sides: with the service
role to prove they exist, and with the anon key to prove they return nothing
without a session.

**Limits are enforced at mint time.** `checkPlanAllowance()` in
[`src/lib/account.ts`](src/lib/account.ts) reads the `plan_usage` view inside
[`/api/signed-url`](src/app/api/signed-url/route.ts), before `getSignedUrl` —
the single chokepoint through which every billable conversation passes. A
learner over their plan's minutes or sessions gets a 403 with a plain sentence
instead of a credential. The check fails open (no view, no Supabase → the teacher
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

### Session memory: the free-text half

A learner can log out, come back days later, and the teacher picks up the thread,
including asking whether they did the thing they committed to. That follow-up is
the difference between teaching and advice.

No LLM of ours writes anything: ElevenLabs already summarises every finished
conversation. When `/api/signed-url` mints a new session,
[`learnerContext()`](src/lib/memory.ts) reads the learner's recent
`coach_sessions` rows, fetches any summaries not yet cached (bounded, so a
start never waits on more than two), stores them on the rows, and returns the
last three as a context block. The browser sends that block through
`sendContextualUpdate` alongside the date and the session objective, and the
persona's *Continuidad entre sesiones* section says how to use it: follow up on
the commitment early, never recite the record, and follow the person if they
bring a different topic today.

Run [`supabase/migrations/20260802000000_session_memory.sql`](supabase/migrations/20260802000000_session_memory.sql)
to add the summary columns. Until it has run, memory still works — summaries
are fetched from ElevenLabs live on every start instead of cached — so the
migration is a cost optimisation, not a feature flag. Deleting a conversation
at ElevenLabs before its summary is cached forgets that session; after, the
cached copy survives.

### Structured memory: the profile and the plan

The summaries above are ElevenLabs' free-text paragraphs, which is enough to open
a session warmly and not enough to teach from. Three tables carry the part you
can teach from, filled from the extraction fields in
[`dataCollection()`](src/lib/agent.ts) and read back by
[`progress.ts`](src/lib/progress.ts). See
[Accounts, plans and usage](#accounts-plans-and-usage) for their columns.

**The plan is not generated.** `buildPlan` in
[`curriculum.ts`](src/lib/curriculum.ts) joins the fixed curriculum with the
tasks and the path the diagnostic collected. Deterministic, so the plan the
teacher works through is byte-for-byte the plan the progress page renders, and
"paso 4 de 11" means one thing. It is built the first time a profile has weekly
tasks, which is why a diagnostic that ran out of minutes before that question
leaves no plan and says so on the progress page.

**Memory reaches the agent as dynamic variables**, not as a contextual update:

| Variable | What it carries |
|---|---|
| `apertura` | The first thing said out loud, composed server-side. On a first session it asks what they do; on a later one it names the step and the commitment. |
| `registro` | The compact record: profile, chosen path, current step, last commitment with its status, days since the last session. Capped at 800 characters. |
| `primera_sesion` | `sí` or `no`, which is what tells the persona to run the diagnostic instead of opening on a plan that does not exist. |

The first message is spoken before any LLM turn, so an opening that names the
step cannot be a fixed string and must not depend on a model remembering to
perform it. Placeholders for all three are declared on the agent, because a
prompt referencing a variable nothing supplies fails the whole conversation, and
that is exactly what a test from the ElevenLabs dashboard would do.

### The post-call webhook

Session memory works without it: `memory.ts` fetches what it needs on the next
connect. The plan does not. The plan has to exist before the learner opens the
progress page, which is the thing that brings them back between sessions, and
"the next time you start a call" is too late for a page whose whole job is to be
read in between.

[`/api/webhooks/elevenlabs`](src/app/api/webhooks/elevenlabs/route.ts) receives
the post-call analysis and writes the profile, the plan, the step that advanced
and the session row, in one pass. Set it up in the ElevenLabs dashboard:

```
Conversational AI -> Settings -> Webhooks
URL:    https://<app>.vercel.app/api/webhooks/elevenlabs
Events: post_call_transcription
```

Copy the signing secret into `ELEVENLABS_WEBHOOK_SECRET`. Without it the route
refuses every request, which is the right default: an unauthenticated endpoint
that writes to a learner's plan is worse than no webhook. Verification is HMAC
SHA-256 over `${timestamp}.${body}` with a 30-minute tolerance, compared with
`timingSafeEqual`, and the learner is resolved from `coach_sessions` by
conversation id rather than from the payload, so a request cannot name a user of
its own choosing.

Rows are keyed on the conversation id, so a redelivery updates rather than
duplicating.

Run [`supabase/migrations/20260810000000_teacher_memory.sql`](supabase/migrations/20260810000000_teacher_memory.sql).
Reads fail soft on a missing table or column, so a deployment without the
migration behaves like one without memory rather than erroring.

### Commitments

The follow-up above used to be a coin flip. The commitment lived only in the
free-text summary, so the teacher asked about it when ElevenLabs happened to keep
it and silently didn't when it didn't — for the one behaviour the product sells
hardest.

It is now extracted as a field.
[`dataCollection()`](src/lib/agent.ts) declares three of them on every agent —
the action, the deadline as it was said, and the signal that would count as it
having worked, which are exactly the three parts the persona demands. ElevenLabs
fills them in when it analyses the call, so there is still no LLM of ours;
[`commitments.ts`](src/lib/commitments.ts) stores them on the same lazy
backfill as the summary and returns the most recent one, which is what `/coach`
shows above the microphone and what [`learnerContext()`](src/lib/memory.ts) puts
at the top of the next session's context.

`coach_sessions` has deliberately **no completion column**: nothing could set it
honestly from a transcript we never read. `session_summaries.commitment_done`
does have one, and it is three-state, because the learner answers it themselves
on the progress page and "nobody has said yet" is not the same as "no".

Run [`supabase/migrations/20260805000000_commitments.sql`](supabase/migrations/20260805000000_commitments.sql)
for the columns, and `npm run sync:agent -- --push` so the agent carries the
extraction fields. Both degrade quietly: without the migration the reads and
writes are skipped and nothing else changes, and an agent provisioned before a
field existed picks it up on the next sync.

## Tuning retrieval

The knobs live in `ragConfig()` in [`src/lib/agent.ts`](src/lib/agent.ts):

- **`max_vector_distance`** (0.8 by default) is the relevance gate and the
  setting that matters most. Set too tight and the teacher retrieves nothing,
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

  `TEACHER.maxVectorDistance` in [`src/lib/teacher.ts`](src/lib/teacher.ts) is
  the default; `ELEVENLABS_MAX_VECTOR_DISTANCE` overrides it without a deploy.
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

The persona is built by `persona()` in the same file and returned by
`teacherSystemPrompt()`, with the curriculum rendered into it from
[`curriculum.ts`](src/lib/curriculum.ts). Written for voice, so turns run to at
most 3 sentences and nothing is read aloud that only makes sense on a page. See
[How a session goes](#how-a-session-goes).

### `auto` vs `prompt` usage mode

| Mode | Behavior | Use for |
|---|---|---|
| `auto` (default) | Retrieved via RAG only when relevant | Everything. Scales to large corpora. |
| `prompt` | Pinned into the system prompt every turn | Short, always-needed context only |

`prompt` mode costs tokens on *every* turn, so reserve it for things like a
glossary of internal acronyms. Pass `"usageMode": "prompt"` on upload, or tick
"Always in context" in the UI.

## How a session goes

**The first session is a diagnostic.** One question per turn, each under two
sentences, until the teacher has the role or degree, the field and sector, the
years, the 3 to 5 tasks that fill most of the week, the tools already used,
whether AI is already in play, and the goal. It reflects the profile back in
three sentences, gives the map, and asks which of the three paths is theirs. Then
the plan gets built and the learner is told where to see it. It closes on the
first commitment.

**Every session after that is a lesson**, in this order: review the evidence for
the current step in at most three sentences (what worked, what is missing, what a
stronger version looks like), then teach, then close on a commitment. A lesson is
the concept in two sentences, the exact steps at voice pace, the verification
habit, and one exercise on the learner's own task corrected in session. It
explains why the technique works, not only which button to press.

**It asks where the learner is.** At a computer: one step per turn, waiting for
confirmation, adapting to what they report seeing. Walking or driving: concept,
reasoning and rehearsal by voice, and the hands-on part becomes homework with
exact steps.

Both close the same way: 1 action, 1 date, 1 signal that would confirm it worked.
The next session opens by asking about it, and does not accept "sí, lo hice"
without a description.

### Why not just use ChatGPT

Every visitor is asking this, so it is worth being able to answer in behaviour
rather than in adjectives. Most of the persona is *prohibitions*: no invented
figures, no invented course names, no claiming to have looked something up. Those
keep the teacher from being **worse** than a general assistant. None of them make
it better than one.

Four things do the differentiating, each checkable in a single session, and each
one listed on the landing page in `DIFFERENCES`:

- **It interviews you first.** A general assistant answers what you ask, so a
  learner who does not know what to ask gets nowhere. This one starts from your
  week and teaches on your own tasks.
- **It has a curriculum.** Four levels in a fixed order, with a step count you
  can see. A chat window has no notion of where you are in anything.
- **It knows what you owe.** The commitment is an extracted field, not a hope
  that a summariser kept it, and the next session opens on it.
- **It distinguishes what it knows from what it has.** It names the source when
  it retrieved one, says so when the answer is general criterion, and gives no
  figures without a source. A general model recalls the same ideas unsourced and,
  the part that matters, cannot tell you which of the two it is doing.

If you drop one of these from the persona, drop it from `DIFFERENCES` and
`PROMISES` in [`src/lib/site.ts`](src/lib/site.ts) in the same change. Those are
claims a visitor can falsify in one session, and `npm run doctor` fails when a
`PROMISES` entry has no matching marker in the built prompt.

**The date is injected from the browser**, in
[`VoiceTutor`](src/components/VoiceTutor.tsx). Without it the commitment step
degrades: a model has no clock, so it either invents a date or retreats to "this
week", which is the vagueness the commitment exists to remove. It also feeds
"days since your last session" in the record.

### Pushing a persona change

The persona is source code, but the agent holds its own copy: editing
`persona()` in [`agent.ts`](src/lib/agent.ts), or a lesson title in
[`curriculum.ts`](src/lib/curriculum.ts), changes nothing audible until it is
pushed.

```bash
npm run sync:agent            # report drift, change nothing
npm run sync:agent -- --push  # apply
```

Dry by default: it writes to a live agent that someone may be mid-conversation
with. The same call re-attaches every indexed document and re-declares the
dynamic-variable placeholders and the extraction fields, because the whole prompt
block goes up in one PATCH and is not separable.

`POST /api/agent` on a deployment does the same thing, but requires shipping the
change before you can hear it.

## Layout

```
src/lib/elevenlabs.ts   Typed REST client (knowledge base, RAG, agents, signed URLs)
src/lib/knowledge.ts    Ingestion + index status
src/lib/catalog.ts      Assembles document state from ElevenLabs + agent config
src/lib/agent.ts        Persona, RAG config, data collection, knowledge sync
src/lib/curriculum.ts   The 4 levels, the lessons, and buildPlan
src/lib/teacher.ts      Agent identity, corpus prefixes, spoken openings
src/lib/progress.ts     Profile, plan and session rows, both directions
src/lib/auth.ts         Shared-secret gate
src/lib/config.ts       Env config + bounded-concurrency helper
src/app/api/            Route handlers
src/app/progreso/       The notebook: map, plan, evidence, history
src/components/         VoiceTutor, KnowledgeManager, KnownTopics
src/lib/site.ts         Landing-page copy, incl. the falsifiable DIFFERENCES list
scripts/                setup-agent, sync-agent, bulk ingest, doctor
```

## Known limits

- **The catalog fans out one status request per document**, capped at 8
  concurrent. Past a few hundred documents, paginate the list route.
- **Corpus isolation is per-agent, not per-workspace.** The agent attaches only
  documents matching `TEACHER.sources`, so the retired corpora cannot be
  retrieved. The documents themselves are still workspace-wide, so any agent you
  create by hand *could* be pointed at them, which is fine for material we wrote
  and not sufficient for a client's private corpus, which needs its own workspace.
- **Voice needs HTTPS.** Fine on Vercel and on `localhost`; a plain-HTTP host
  will silently fail to get mic access.
- **Procedural steps come from general knowledge, and go stale.** The teacher's
  job includes saying which menu to open and what to type, and no corpus here
  documents anyone's interface. Those steps come from the model, are subject to
  the honesty rule like anything else, and are wrong the moment a vendor moves a
  button. The persona says so while giving them, keeps them at voice pace, and
  pairs each with a way to check the result, which is what makes a wrong step
  recoverable rather than misleading.
- **Step status depends on the extractor.** `lesson_taught` comes back as the
  teacher's own phrasing, matched against the learner's step titles by loose
  comparison. A paraphrase far enough from the title falls back to the current
  step, and a session that taught nothing advances nothing. The learner can see
  and correct the result on `/progreso`, which is the backstop.
- **The free tier is a lifetime 20 minutes**, enforced at mint time against the
  `plan_usage_total` view. Nothing takes money yet: `CHECKOUT_READY` in
  [`plans.ts`](src/lib/plans.ts) is false and the paid buttons write to a person.
- **Memory needs Supabase and the webhook.** Without the service role there is no
  ledger, so every conversation starts cold. Without
  `ELEVENLABS_WEBHOOK_SECRET` the profile and the plan are never written, and the
  progress page stays empty however many sessions happen. Both fail soft: the
  teacher still talks.
- **The persona is 14.8k characters** and rides on every turn. `npm run doctor`
  fails past 15k and warns inside 500 of it, which matters because the prompt
  grows on its own: every lesson title added to the curriculum lands in it. It is
  a system prompt, so it caches, but a materially larger one starts to be felt as
  latency in voice, where it is far more noticeable than in text.
