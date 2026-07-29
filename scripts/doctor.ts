/**
 * Local connectivity check against the ElevenLabs API.
 *
 *   npm run doctor
 *
 * Same three questions `/api/health` answers — key present, key carries the
 * Conversational AI scope, agent exists — but run straight from `.env.local`
 * with no server and no ingest secret. That matters during setup: the HTTP
 * route needs INGEST_SECRET to be configured before it will tell you anything,
 * which is unhelpful when what you are trying to fix is the configuration.
 *
 * Prints only whether things work. Never prints key material.
 */
import './env';
import { getAgent, listDocuments } from '../src/lib/elevenlabs';
import { agentId, embeddingModel } from '../src/lib/config';

const ok = (m: string) => console.log(`  ok    ${m}`);
const bad = (m: string) => console.log(`  FAIL  ${m}`);

async function main() {
  let failures = 0;

  console.log('\nElevenLabs connectivity\n');

  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (key) {
    // Show enough to tell two keys apart, never enough to use one.
    ok(`ELEVENLABS_API_KEY is set (${key.slice(0, 6)}…, ${key.length} chars)`);
  } else {
    bad('ELEVENLABS_API_KEY is missing. Put it in .env.local.');
    failures++;
  }

  // Listing the knowledge base exercises exactly the permission this app needs,
  // so a key that passes here cannot fail later during ingestion for scope
  // reasons.
  let scopeOk = false;
  if (key) {
    try {
      const { documents } = await listDocuments({ pageSize: 1 });
      scopeOk = true;
      ok(
        `Conversational AI scope confirmed — knowledge base reachable (${
          documents.length > 0 ? 'has documents' : 'currently empty'
        })`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      bad(
        /missing the permission/.test(message)
          ? 'Key authenticates but lacks the Conversational AI scope. Enable convai read+write on the key.'
          : message,
      );
      failures++;
    }
  }

  const id = agentId();
  if (!id) {
    bad('ELEVENLABS_AGENT_ID is not set. Run `npm run setup:agent` to create one.');
    failures++;
  } else if (!scopeOk) {
    console.log(`  --    Agent ${id} configured, but unverifiable without API access`);
  } else {
    try {
      const agent = await getAgent(id);
      const prompt = agent.conversation_config?.agent?.prompt;
      ok(
        `Agent ${id} exists — ${prompt?.knowledge_base?.length ?? 0} document(s) attached, RAG ${
          prompt?.rag?.enabled ? 'enabled' : 'disabled'
        }`,
      );
    } catch (err) {
      bad(`Agent ${id} could not be fetched: ${err instanceof Error ? err.message : err}`);
      failures++;
    }
  }

  // Not a pass/fail check: it is only wrong relative to the corpus. Worth
  // printing because changing it later silently orphans every existing index.
  console.log(`\n  Embedding model: ${embeddingModel()}`);

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed. Ingestion will not work until they pass.\n`);
    process.exit(1);
  }
  console.log('\nReady to ingest.\n');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
