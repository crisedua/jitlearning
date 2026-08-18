/**
 * The tests have to actually run.
 *
 * A test file that is never executed is indistinguishable from one that passes,
 * and this project has now shipped both ways of getting there. The npm script
 * globbed `src/**''/*.test.ts` unquoted, and npm runs scripts through `sh`, where
 * `**` matches one directory level: everything below `src/lib` was skipped in
 * silence, including the file covering the fix it was written for. It looked
 * right from a zsh prompt, where `**` is recursive, which is why it survived.
 * Earlier, a heredoc created an empty test file, and the suite counted it as a
 * pass; it was caught only because the total moved by one instead of five.
 *
 * So this file checks the harness rather than the product. It is the one test
 * whose failure means the other numbers are not trustworthy.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..', '..');

/** Every `*.test.ts` in the repo, found the way a person would expect. */
function testFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...testFiles(full));
    else if (entry.name.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

const files = [
  ...testFiles(path.join(ROOT, 'src')),
  ...testFiles(path.join(ROOT, 'scripts')),
];

describe('the test harness', () => {
  it('finds test files nested deeper than one directory', () => {
    // If this is ever false the check below is meaningless, because the bug it
    // guards against only shows up with a file at src/<dir>/<dir>/x.test.ts.
    const nested = files.filter((f) => f.split(path.sep).length > ROOT.split(path.sep).length + 3);
    assert.ok(nested.length > 0, 'no nested test file exists to prove the glob works');
  });

  it('hands the glob to node instead of the shell', () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    const script = pkg.scripts.test!;
    assert.match(
      script,
      /"src\/\*\*\/\*\.test\.ts"/,
      'the src glob must be quoted, or sh expands ** as one level and nested tests never run',
    );
  });

  it('has no file that would pass by having nothing in it', () => {
    const empty = files.filter((f) => !/\n\s*(it|test)\(/.test(readFileSync(f, 'utf8')));
    assert.deepEqual(empty, [], `these declare no tests: ${empty.join(', ')}`);
  });

  it('has no .only, which silently skips everything else', () => {
    const focused = files.filter((f) => /\b(it|describe|test)\.only\(/.test(readFileSync(f, 'utf8')));
    assert.deepEqual(focused, [], `these would skip the rest of the suite: ${focused.join(', ')}`);
  });
});
