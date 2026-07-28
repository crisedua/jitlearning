/**
 * Bulk-ingest a directory into the knowledge base, wait for indexing, then
 * attach everything to the coach.
 *
 *   npm run ingest -- ./docs
 *
 * Runs against the ElevenLabs API directly (not through the deployed app), so
 * it needs ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID in the environment — not
 * the ingest secret. Blocks until every document is queryable, which makes it
 * safe to use in a provisioning or CI step.
 */
import './env';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { ingest, waitForIndexing } from '../src/lib/knowledge';
import { syncAgentKnowledge } from '../src/lib/agent';

/**
 * ElevenLabs validates the upload's MIME type and rejects
 * `application/octet-stream`, which is what `new File()` defaults to. Map each
 * extension explicitly rather than relying on the runtime to guess.
 */
const MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.epub': 'application/epub+zip',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const SUPPORTED = new Set(Object.keys(MIME_TYPES));

async function collect(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await collect(full)));
    else if (SUPPORTED.has(path.extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}

async function main() {
  const dir = process.argv.slice(2).find((a) => !a.startsWith('--'));

  if (!dir) {
    console.error('Usage: npm run ingest -- <directory>');
    process.exit(1);
  }
  if (!(await stat(dir).catch(() => null))?.isDirectory()) {
    console.error(`${dir} is not a directory.`);
    process.exit(1);
  }

  const files = await collect(dir);
  if (files.length === 0) {
    console.error(`No supported files under ${dir}. Supported: ${[...SUPPORTED].join(', ')}`);
    process.exit(1);
  }

  console.log(`Ingesting ${files.length} file(s)…\n`);
  const ids: string[] = [];

  for (const file of files) {
    const name = path.basename(file);
    try {
      const buffer = await readFile(file);
      const type = MIME_TYPES[path.extname(file).toLowerCase()] ?? 'text/plain';
      const doc = await ingest(
        { kind: 'file', file: new File([new Uint8Array(buffer)], name, { type }) },
        { name },
      );
      ids.push(doc.id);
      console.log(`  + ${name}`);
    } catch (err) {
      console.error(`  ! ${name}: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (ids.length === 0) {
    console.error('\nNothing was ingested.');
    process.exit(1);
  }

  console.log('\nWaiting for RAG indexing…');
  const results = await waitForIndexing(ids);
  const ready = [...results.values()].filter((s) => s === 'succeeded').length;
  console.log(`  ${ready}/${ids.length} document(s) indexed and ready.`);

  for (const [id, status] of results) {
    if (status !== 'succeeded') console.warn(`  ! ${id}: ${status}`);
  }

  const { agentId: id, attached } = await syncAgentKnowledge();
  console.log(`\n✓ Agent ${id} now has ${attached} document(s) attached.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
