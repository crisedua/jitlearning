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
import { syncAllCoaches } from '../src/lib/agent';
import { availableCoaches, coachOwnsDocument } from '../src/lib/coaches';

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
 *
 * `_retired` holds the corpora of coaches this product no longer runs. The
 * documents stay on disk because they were written here and may be worth
 * something later, but ingesting them would attach material no coach claims —
 * invisible until a learner gets an answer from a subject the product dropped.
 */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'out',
  '_retired',
]);

/**
 * The name a document is stored under: `<carpeta>/<archivo>`.
 *
 * ElevenLabs keeps no folder of its own — a document is its name and nothing
 * else. That prefix is therefore the only thing telling `attachableEntries()`
 * which coach a document belongs to, which makes it the corpus boundary rather
 * than a cosmetic detail.
 *
 * Both ways of invoking this script have to land on the same name, or a
 * re-ingest of one folder creates a second copy under a different name instead
 * of replacing the first:
 *
 *   npm run ingest -- ./knowledge           -> relative path already has it
 *   npm run ingest -- ./knowledge/negocio   -> take it from the directory
 *
 * Always forward slashes, including on Windows, where `path.relative` returns
 * backslashes and would produce a name no prefix in `coaches.ts` can match.
 */
function documentName(dir: string, file: string): string {
  const relative = path.relative(path.resolve(dir), path.resolve(file)).split(path.sep);
  return relative.length > 1
    ? relative.join('/')
    : `${path.basename(path.resolve(dir))}/${relative[0]}`;
}

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
  const names: string[] = [];

  for (const file of files) {
    const name = documentName(dir, file);
    try {
      const stale = existing.get(name);
      const buffer = await readFile(file);
      const type = MIME_TYPES[path.extname(file).toLowerCase()] ?? 'text/plain';
      const doc = await ingest(
        { kind: 'file', file: new File([new Uint8Array(buffer)], name, { type }) },
        { name },
      );
      ids.push(doc.id);
      names.push(name);

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

  /*
   * A document nobody claims is invisible.
   *
   * It uploads and indexes without complaint, then matches no prefix in
   * `coaches.ts` and is attached to no agent — so the only symptom is a coach
   * saying it has no material on its own subject, discovered by a learner. Say
   * it here, where the name that caused it is still on screen.
   */
  const orphans = names.filter(
    (name) => !availableCoaches().some((coach) => coachOwnsDocument(coach, name)),
  );
  if (orphans.length > 0) {
    console.warn('\n! No coach claims these documents, so none will be attached:\n');
    for (const name of orphans) console.warn(`    ${name}`);
    console.warn('\n  Add the prefix to a coach\'s `sources` in src/lib/coaches.ts.');
  }

  /*
   * Leftovers from before names carried their folder.
   *
   * Replacement is keyed on the full name, so re-ingesting `negocio/01-x.md`
   * does not touch an older document called plain `01-x.md`. The old copy is
   * detached from every agent by the sync below — it matches no coach prefix —
   * so it is inert, but it still occupies workspace RAG storage and shows up in
   * the knowledge admin list looking current. Named here rather than deleted:
   * removing documents nobody asked us to remove is not this script's call.
   */
  const superseded = names
    .map((name) => name.split('/').slice(1).join('/'))
    .filter((bare) => existing.has(bare));
  if (superseded.length > 0) {
    console.warn(
      `\n! ${superseded.length} document(s) still exist under their old, unprefixed name:\n`,
    );
    for (const bare of superseded) console.warn(`    ${bare}`);
    console.warn(
      '\n  They are attached to no coach and are safe to leave, but they take up\n' +
        '  RAG storage. Delete them from /knowledge once the new copies read correctly.',
    );
  }

  /*
   * Sync every coach, not just the one whose folder was ingested: a document
   * may belong to several (`herramientas/` belongs to all of them), and each
   * agent holds its own copy of the attachment list.
   */
  console.log('');
  const { perCoach } = await syncAllCoaches();
  for (const { coach, attached, error } of perCoach) {
    if (error) console.error(`! ${error}`);
    else console.log(`✓ ${coach.label}: ${attached} document(s) attached.`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
