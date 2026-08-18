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
