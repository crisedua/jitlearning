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
import { deleteDocument, listDocuments } from '../src/lib/elevenlabs';
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

/**
 * Never worth descending into, and `node_modules` in particular turns the
 * duplicate-name check below into a walk of tens of thousands of files when the
 * corpus root is the repo root.
 */
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'out']);

async function collect(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      out.push(...(await collect(full)));
    } else if (SUPPORTED.has(path.extname(entry.name).toLowerCase())) {
      out.push(full);
    }
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

  /*
   * A document is identified by its file name alone, with no folder, so two
   * files called `08-errores-y-desacuerdos.md` in different folders are the
   * same document to ElevenLabs. Ingesting one silently overwrites the other:
   * no error, no duplicate, just a document whose content is now about
   * something else, discovered whenever somebody asks about the topic that
   * disappeared.
   *
   * Checked against the whole corpus rather than the folder being ingested,
   * because the collision that matters is with a folder you are *not* touching.
   */
  const siblingRoot = path.dirname(path.resolve(dir));
  const collisions = new Map<string, string[]>();
  for (const file of await collect(siblingRoot).catch(() => [] as string[])) {
    const name = path.basename(file);
    collisions.set(name, [...(collisions.get(name) ?? []), file]);
  }
  const clashing = files
    .map((f) => path.basename(f))
    .filter((name) => (collisions.get(name)?.length ?? 0) > 1);

  if (clashing.length > 0) {
    console.error('Duplicate document names across the corpus — ingesting would overwrite:\n');
    for (const name of new Set(clashing)) {
      console.error(`  ${name}`);
      for (const file of collisions.get(name)!) console.error(`    ${file}`);
    }
    console.error('\nRename one of each pair. Names must be unique across every folder.');
    process.exit(1);
  }

  /*
   * Replace by name rather than blindly adding.
   *
   * ElevenLabs happily stores two documents with the same name, so re-running
   * this on a folder used to double it. Nothing errors — retrieval just starts
   * pulling duplicate chunks, which crowds out other material and burns the
   * chunk budget on text the agent already has. Editing a document and
   * re-ingesting its folder is a routine loop, so this has to be idempotent.
   */
  const existing = new Map<string, string>();
  for (const doc of (await listDocuments({ pageSize: 100 })).documents) {
    existing.set(doc.name, doc.id);
  }

  console.log(`Ingesting ${files.length} file(s)…\n`);
  const ids: string[] = [];

  for (const file of files) {
    const name = path.basename(file);
    try {
      const stale = existing.get(name);
      const buffer = await readFile(file);
      const type = MIME_TYPES[path.extname(file).toLowerCase()] ?? 'text/plain';
      const doc = await ingest(
        { kind: 'file', file: new File([new Uint8Array(buffer)], name, { type }) },
        { name },
      );
      ids.push(doc.id);

      /*
       * Delete the old copy only once the new one is stored, so a failed upload
       * leaves the corpus as it was rather than emptied. `force` detaches it from
       * the agent, which the sync at the end then puts right.
       */
      if (stale) {
        await deleteDocument(stale, true);
        console.log(`  ~ ${name} (reemplazado)`);
      } else {
        console.log(`  + ${name}`);
      }
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
