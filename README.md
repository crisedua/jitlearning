# JIT Learning

A just-in-time learning system: a voice coach that answers the question blocking
you *right now*, grounded in your own material via RAG.

Built on the [ElevenLabs Agents Platform](https://elevenlabs.io/docs/eleven-agents)
— ElevenLabs handles speech-to-text, the LLM turn, text-to-speech, chunking,
embedding and vector retrieval. This repo is the ingestion backend, the agent
configuration, and the UI around it.

**Fully stateless.** There is no database. ElevenLabs holds the documents and
their indexes; the agent's own config records which documents are attached and
in which mode. Any number of Vercel instances see identical state.

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
| `/api/health` | GET | secret | Config diagnostics: key, scope, agent |
| `/api/signed-url` | GET | **open** | Short-lived WebSocket URL for the browser |

## Deploying to Vercel

You never need the ElevenLabs key on your own machine — the agent can be created
from the deployed app, using the key already in Vercel's environment.

```bash
npx vercel                     # deploy
```

Set these in **Project Settings → Environment Variables**, then redeploy:

- `ELEVENLABS_API_KEY` — your key, with Conversational AI read+write
- `INGEST_SECRET` — `openssl rand -hex 32`

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
| `ELEVENLABS_VOICE_ID` | no | Defaults to a stock voice |
| `ELEVENLABS_AGENT_LLM` | no | Blank = workspace default |
| `ELEVENLABS_EMBEDDING_MODEL` | no | Set before indexing anything |

Nothing else to provision — no database, no volume, no cron.

### Bulk loading

For a large initial corpus, run against the ElevenLabs API directly rather than
through the deployed app. This blocks until every document is queryable, so it
is safe in a provisioning or CI step and avoids the serverless timeout:

```bash
npm run ingest -- ./docs
```

## Auth model

Every knowledge and agent route requires `INGEST_SECRET`, compared in constant
time. Routes **fail closed** — if the variable is unset they return `503` in
every environment, including local development. Security that behaves
differently in dev than in production is how things ship open by accident.

`/api/signed-url` is deliberately open: the learner-facing coach page needs it
and a browser cannot hold a shared secret. **This is the remaining exposure** —
anyone with the URL can start a billable conversation. Put a real session check
there before this reaches an audience you don't control.

The Knowledge UI prompts for the secret and keeps it in `sessionStorage`, so it
dies with the tab.

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

The tutor persona is `TUTOR_SYSTEM_PROMPT` in the same file. It's written for
voice — short turns, no formatting read aloud — and for JIT pedagogy: answer the
blocking question, then check it landed, rather than delivering a curriculum.

### `auto` vs `prompt` usage mode

| Mode | Behavior | Use for |
|---|---|---|
| `auto` (default) | Retrieved via RAG only when relevant | Everything. Scales to large corpora. |
| `prompt` | Pinned into the system prompt every turn | Short, always-needed context only |

`prompt` mode costs tokens on *every* turn, so reserve it for things like a
glossary of internal acronyms. Pass `"usageMode": "prompt"` on upload, or tick
"Always in context" in the UI.

## Layout

```
src/lib/elevenlabs.ts   Typed REST client (knowledge base, RAG, agents, signed URLs)
src/lib/knowledge.ts    Ingestion + index status
src/lib/catalog.ts      Assembles document state from ElevenLabs + agent config
src/lib/agent.ts        Tutor persona, RAG config, knowledge sync
src/lib/auth.ts         Shared-secret gate
src/lib/config.ts       Env config + bounded-concurrency helper
src/app/api/            Route handlers
src/components/         VoiceTutor, KnowledgeManager
scripts/                setup-agent, bulk ingest
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
