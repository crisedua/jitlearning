# JIT Learning

A just-in-time learning system: a voice advisor you think out loud with about
using language models at work, grounded in your own material via RAG.

Built on the [ElevenLabs Agents Platform](https://elevenlabs.io/docs/eleven-agents)
— ElevenLabs handles speech-to-text, the LLM turn, text-to-speech, chunking,
embedding and vector retrieval. This repo is the ingestion backend, the agent
configuration, and the UI around it.

**The knowledge side is stateless.** ElevenLabs holds the documents and their
indexes; the agent's own config records which documents are attached and in
which mode. Any number of Vercel instances see identical state.

**Supabase holds the people.** Sign-in, profiles, plans, and one row per coach
session — see [Accounts, plans and usage](#accounts-plans-and-usage). Nothing
about the corpus lives there, so the two halves fail independently: a Supabase
outage stops new sign-ins, it does not touch retrieval.

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
| `/api/agent` | GET | secret | Agent status, attached count |
| `/api/agent` | POST | secret | Re-attach all ready documents |
| `/api/agent/provision` | POST | secret | Create the agent (hosted `setup:agent`) |
| `/api/health` | GET | secret | Config diagnostics: key, scope, agent, sign-in |
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
agent exists. Anything false tells you which of the three is wrong.

### Local development (optional)

If you'd rather work locally, put the same values in `.env.local` and run
`npm run setup:agent` instead of the provision endpoint.

### Environment variables

| Variable | Required | Notes |
|---|---|---|
| `ELEVENLABS_API_KEY` | yes | Needs Agents + Knowledge Base read/write |
| `ELEVENLABS_AGENT_ID` | yes | From `npm run setup:agent` |
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

**Document names are file names, with no folder.** Two files called
`08-errores-y-desacuerdos.md` in different folders are one document to
ElevenLabs, and ingesting one silently overwrites the other — no error, no
duplicate, just a document that is now about something else. The script refuses
to run when it finds a collision anywhere in the corpus; keep base names unique
across every folder.

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

## Tuning retrieval

The knobs live in `ragConfig()` in [`src/lib/agent.ts`](src/lib/agent.ts):

- **`max_vector_distance`** (0.8) — the relevance gate, and the setting that
  matters most. Set too tight, the coach retrieves nothing and falls back to
  general knowledge **in the same confident voice** it uses when grounded, so
  the learner cannot tell the difference. This is not theoretical: at 0.6, a
  question about a study the model already knew from training produced invented
  figures plus a statistic the source never contained. At 0.8 it retrieves
  correctly. Raise it further only while watching for the opposite failure —
  loosely-related chunks answered from as if they were on point.

  Tune it against questions whose answers you can check by hand, and include at
  least one on a topic the model likely knows independently. Questions only your
  corpus can answer will pass at almost any threshold and tell you nothing.
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

The persona is `TUTOR_PERSONA` in the same file, returned by
`tutorSystemPrompt()`. Written for voice — short turns, nothing read aloud that
only makes sense on a page — and for advising rather than instructing. See
[What the coach is for](#what-the-coach-is-for).

### `auto` vs `prompt` usage mode

| Mode | Behavior | Use for |
|---|---|---|
| `auto` (default) | Retrieved via RAG only when relevant | Everything. Scales to large corpora. |
| `prompt` | Pinned into the system prompt every turn | Short, always-needed context only |

`prompt` mode costs tokens on *every* turn, so reserve it for things like a
glossary of internal acronyms. Pass `"usageMode": "prompt"` on upload, or tick
"Always in context" in the UI.

## What the coach is for

A thinking partner on using language models, not a step-by-step instructor.

The persona refuses click-by-click procedures even when asked for them
outright — and it is asked that way most of the time. Two reasons, both load
bearing: there is no interface material in the corpus, so any sequence of clicks
would come from memory and the button names churn every few weeks; and someone
asking for steps usually wants to solve something, so handing over the mechanics
alone leaves them able to press buttons without the judgement to know whether
they should. It says the vendor docs are the better source, in one sentence
without apologising, and moves to the decision underneath.

What it does instead: explains concepts and how mechanisms differ, gives a
recommendation with the condition that would flip it rather than a comparison
table, disagrees early when the framing is wrong, and raises the one thing that
changes what you should do rather than a list of risks.

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

The persona is source code, but the agent holds its own copy — editing
`TUTOR_PERSONA` changes nothing audible until it is pushed.

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
src/lib/agent.ts        Advisor persona, RAG config, knowledge sync
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
- **The agent attaches every ready document in the workspace.** If you run other
  ElevenLabs agents off the same knowledge base, they'll share a corpus.
- **Voice needs HTTPS.** Fine on Vercel and on `localhost`; a plain-HTTP host
  will silently fail to get mic access.
- **No interface material in the corpus.** Deliberate — the coach advises rather
  than instructs — but it means any procedural question is answered by pointing
  at the vendor docs, not from knowledge.
- **Memory is per-deployment-with-Supabase, and only as good as the
  summaries.** Session memory (see [Session memory](#session-memory)) needs the
  service role to read the ledger — a deployment without Supabase starts every
  conversation cold, as before. The summaries themselves are ElevenLabs'
  automatic ones: a paragraph per call, usually in English, with no control
  over what they keep. The commitment usually survives; nuance does not.
- **The persona is long** (~14.7k characters, roughly 3.7k tokens) and rides on
  every turn. It is a system prompt, so it caches, but a materially larger one
  will start to be felt as latency in voice, where it is much more noticeable
  than in text.
