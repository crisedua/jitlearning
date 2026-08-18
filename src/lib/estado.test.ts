/**
 * The deployment status page reports on every variable the README says matters.
 *
 * `/admin/estado` is the one place that answers for the deployment rather than
 * for a laptop, and its environment section ends in "todas puestas" when nothing
 * it checks is missing. It checked five of the eleven variables the README
 * documents, so that sentence could appear on a screen that was simultaneously
 * reporting a missing service role two sections above.
 *
 * A green line about a subset, presented as a green line about everything, is
 * exactly the failure this page exists to catch.
 *
 * The README table is the contract: it is what somebody setting this up reads,
 * and anything on it is something whose absence they need told.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();

/**
 * Each row of the "Without it" table, as the names it accepts.
 *
 * A row is one thing that can be missing, not one string. Some name two
 * variables that must both be set (the Supabase pair), and one names a variable
 * and its older alias, where either will do. So a row is satisfied when the page
 * checks any of its names, and the assertion is per row rather than per name.
 */
function documented(): string[][] {
  const readme = readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const table = /\| Variable \| Without it \|([\s\S]*?)\n\n/.exec(readme);
  assert.ok(table, 'the environment table was not found in the README');

  const rows: string[][] = [];
  for (const row of table[1]!.split('\n')) {
    if (!row.startsWith('|')) continue;
    const names = [...(row.split('|')[1]?.matchAll(/`([A-Z_]+)`/g) ?? [])].map((m) => m[1]!);
    if (names.length > 0) rows.push(names);
  }
  return rows;
}

/** Variable names the status page reports on. */
function reported(): Set<string> {
  const page = readFileSync(
    path.join(ROOT, 'src', 'app', 'admin', 'estado', 'page.tsx'),
    'utf8',
  );
  return new Set([...page.matchAll(/label: '([A-Z_]+)'/g)].map((m) => m[1]!));
}

describe('what the deployment page says it is checking', () => {
  const docs = documented();
  const page = reported();

  it('found both lists, so the check below means something', () => {
    assert.ok(docs.length >= 7, `only ${docs.length} rows parsed from the README`);
    assert.ok(page.size >= 8, `only ${page.size} variables reported by the page`);
  });

  for (const names of docs) {
    it(`${names.join(' / ')} is reported`, () => {
      assert.ok(
        names.some((n) => page.has(n)),
        `the README says what breaks without ${names.join(' or ')}, and /admin/estado checks ` +
          `none of them. Its "todas puestas" would be true of everything except this.`,
      );
    });
  }
});
