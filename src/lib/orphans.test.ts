/**
 * Every module in `lib` has to be reachable from something that runs.
 *
 * Written after shipping a module and a commit message saying it had replaced
 * the duplicated logic in two places, when in fact nothing imported it: the
 * duplication was still there, now in three copies, and the claim was checkable
 * with one grep I did not run.
 *
 * That failure is not unusual, it is the default. A new file compiles, its tests
 * pass, the suite goes green, and none of that asks the only question that
 * matters — whether anything calls it. The gap between "written" and "wired" is
 * invisible to every other check in this repo.
 *
 * A module imported only by its own test is the same problem wearing a disguise:
 * it looks like production code, it is counted as covered, and it runs nowhere.
 * There is no allowlist here on purpose. An exception would be the first entry
 * in a list that grows, and the rule is worth more than any file it inconveniences
 * — a helper only a test uses belongs in that test.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const all = [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'scripts'))];
const runtime = all.filter((f) => !f.endsWith('.test.ts'));
/*
 * `lib` and `components` both, and nothing else.
 *
 * Routes and pages are wired by Next's file conventions rather than by an
 * import, so "nothing imports it" is the normal state for them and would make
 * this check noise. Everything here is reached by somebody writing an import,
 * which means it can be forgotten by somebody not writing one.
 */
const modules = runtime.filter(
  (f) =>
    f.startsWith(path.join(ROOT, 'src', 'lib')) ||
    f.startsWith(path.join(ROOT, 'src', 'components')),
);

describe('modules and components', () => {
  it('found the tree it is meant to check', () => {
    assert.ok(modules.length > 25, `only ${modules.length} modules and components found`);
    assert.ok(runtime.length > 40, `only ${runtime.length} runtime files found`);
  });

  it('are each imported by something that is not a test', () => {
    const sources = new Map(runtime.map((f) => [f, readFileSync(f, 'utf8')]));
    const orphans: string[] = [];

    for (const file of modules) {
      const name = path.basename(file).replace(/\.tsx?$/, '');
      const imported = [...sources].some(
        ([other, text]) =>
          other !== file && new RegExp(`from '[^']*/${name}'`).test(text),
      );
      if (!imported) orphans.push(path.relative(ROOT, file));
    }

    assert.deepEqual(
      orphans,
      [],
      `written but never wired: ${orphans.join(', ')}. A module nothing imports is not doing the job its commit said it was.`,
    );
  });
});

/*
 * And no exported function that nothing calls.
 *
 * The module check above asks whether a file is imported. This asks the same
 * question one level down, because a module can be imported for one of its
 * exports while another sits dead inside it — which is how `fromGeneralScraper`
 * survived: `pains.ts` is imported, and that function was written to normalise a
 * second scraper's output, never wired to the replay path it describes, and
 * documented as though it were.
 *
 * Dead code with a docstring is worse than dead code without one. It describes a
 * capability the product does not have, to somebody deciding whether the product
 * has it.
 *
 * Counted inside the defining module too: a helper used only by its own file is
 * doing its job, and only an export nothing calls anywhere is the failure.
 */
describe('exported functions', () => {
  const runtime = all.filter((f) => !f.endsWith('.test.ts'));
  const modules = runtime.filter((f) => f.startsWith(path.join(ROOT, 'src', 'lib')));

  /*
   * Constants too, and they rot differently.
   *
   * A dead function is inert. A dead constant is usually configuration that was
   * read once and is not any more, and it keeps a docstring that describes how
   * the system works. `CHECKOUT_READY = true` was that: nothing read it, and its
   * comment still said `profiles.plan_id` is written by the Stripe webhook and
   * by nothing else, which stopped being true when the feedback grant was built.
   *
   * The value in it was one sentence — that `priceMinor` and the Stripe price
   * are two records of one fact with nothing keeping them in step — and that
   * moved onto the field it is about rather than dying with the constant.
   */
  it('exported constants are read from somewhere', () => {
    const sources = new Map(runtime.map((f) => [f, readFileSync(f, 'utf8')]));
    const dead: string[] = [];

    for (const file of modules) {
      const text = sources.get(file)!;
      for (const m of text.matchAll(/^export const ([A-Z_][A-Z0-9_]*)/gm)) {
        const name = m[1]!;
        const used = new RegExp(`\\b${name}\\b`);
        const own = (text.match(new RegExp(`\\b${name}\\b`, 'g')) ?? []).length - 1;
        const elsewhere = [...sources].some(([f, s]) => f !== file && used.test(s));
        if (own <= 0 && !elsewhere) dead.push(`${path.relative(ROOT, file)}: ${name}`);
      }
    }

    assert.deepEqual(dead, [], `exported and never read: ${dead.join(', ')}`);
  });

  it('are called from somewhere', () => {
    const sources = new Map(runtime.map((f) => [f, readFileSync(f, 'utf8')]));
    const dead: string[] = [];

    for (const file of modules) {
      const text = sources.get(file)!;
      for (const m of text.matchAll(/^export (?:async )?function ([A-Za-z_][A-Za-z0-9_]*)/gm)) {
        const name = m[1]!;
        const call = new RegExp(`\\b${name}\\s*\\(`);
        // One match in its own file is the declaration itself.
        const own = (text.match(new RegExp(`\\b${name}\\s*\\(`, 'g')) ?? []).length - 1;
        const elsewhere = [...sources].some(([f, s]) => f !== file && call.test(s));
        if (own <= 0 && !elsewhere) dead.push(`${path.relative(ROOT, file)}: ${name}()`);
      }
    }

    assert.deepEqual(dead, [], `exported and never called: ${dead.join(', ')}`);
  });
});

/*
 * The corpus folders and the prefixes that claim them.
 *
 * `TEACHER.sources` decides which documents get attached to the agent: a
 * document whose name does not start with one of those prefixes uploads,
 * indexes, and belongs to nobody. The only symptom is a teacher that never
 * cites material somebody wrote and paid to embed.
 *
 * The doctor catches it once the agent is carrying such a document, and the
 * ingest script warns while uploading. Neither fires for a folder that was
 * added and not yet ingested, which is the window where the mistake is free to
 * fix — and the folders are on disk, so the comparison is available.
 *
 * `_retired` is excluded by instruction: those corpora were retired when the
 * product became one teacher, and the files are kept rather than deleted
 * precisely so they are not attached.
 */
describe('the knowledge folders', () => {
  it('are each claimed by a source prefix', async () => {
    const { TEACHER } = await import('./teacher');
    const dir = path.join(ROOT, 'knowledge');

    const folders = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name !== '_retired')
      .map((e) => `${e.name}/`);

    assert.ok(folders.length > 0, 'no corpus folders found, so this checks nothing');

    const unclaimed = folders.filter((f) => !TEACHER.sources.includes(f));
    assert.deepEqual(
      unclaimed,
      [],
      `these folders are ingested and attached to nobody: ${unclaimed.join(', ')}. Add the prefix to TEACHER.sources or move them to _retired.`,
    );
  });

  it('has a prefix for nothing that is missing', async () => {
    // The other direction: a prefix naming a folder that no longer exists means
    // the agent is being asked to attach documents that cannot be produced.
    const { TEACHER } = await import('./teacher');
    const dir = path.join(ROOT, 'knowledge');
    const present = new Set(
      readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => `${e.name}/`),
    );
    const missing = TEACHER.sources.filter((s) => !present.has(s));
    assert.deepEqual(missing, [], `named in TEACHER.sources and not on disk: ${missing.join(', ')}`);
  });
});
