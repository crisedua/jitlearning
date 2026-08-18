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
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { TEACHER } from './teacher';

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

  /*
   * And the other direction, which nothing asked.
   *
   * The checks below go README to page: everything documented as breaking
   * something is reported somewhere. The reverse can fail too and is quieter. A
   * variable the page checks and the README never mentions gives an operator a
   * red row with no explanation of what it costs them, on the page they were
   * told to read after every step of going live.
   *
   * It holds today, for all eleven. Nothing was keeping it that way.
   */
  it('explains every variable the page reports on', () => {
    const readme = readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    const unexplained = [...page].filter((name) => !new RegExp(`\\b${name}\\b`).test(readme));
    assert.deepEqual(
      unexplained,
      [],
      `/admin/estado reports on these and the README never says what breaks without them: ${unexplained.join(', ')}`,
    );
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

/**
 * `npm run doctor` reports on every variable the README says matters, too.
 *
 * The status page and the doctor answer different questions — one for the
 * deployment, one for the machine you are on — and both are only worth running
 * if they cover everything. The doctor has been missing a variable twice:
 * NEXT_PUBLIC_SITE_URL, which decides where the search tool registers and which
 * hostname sign-in may begin on, and ELEVENLABS_WEBHOOK_SECRET, without which a
 * class happens and nothing survives it. Both went unmentioned for dozens of
 * rounds in the tool the README says to run after every step.
 *
 * `ELEVENLABS_AGENT_ID` is referenced through `TEACHER.envKey` rather than as a
 * literal, which is why this resolves that constant instead of grepping for the
 * name: a check that demanded the literal would be asking for noise.
 */
describe('what the doctor says it is checking', () => {
  const docs = documented();
  const doctor = readFileSync(path.join(ROOT, 'scripts', 'doctor.ts'), 'utf8');

  it('found both, so the checks below mean something', () => {
    assert.ok(docs.length >= 7, `only ${docs.length} rows parsed from the README`);
    assert.ok(doctor.length > 5_000, 'doctor.ts looks too small to have been read');
  });

  for (const names of docs) {
    it(`${names.join(' / ')} is checked`, () => {
      assert.ok(
        /*
         * Word-boundary, not substring. `includes` passed a deliberate break
         * where the variable had been renamed to ELEVENLABS_WEBHOOK_SECRET_X,
         * because the original is a prefix of the typo — a guard that accepts
         * the thing it was written to catch.
         */
        names.some((n) => new RegExp(`\\b${n}\\b`).test(doctor) || n === TEACHER.envKey),
        `the README says what breaks without ${names.join(' or ')}, and npm run doctor ` +
          `never mentions it. Somebody following the going-live list would get no signal.`,
      );
    });
  }
});

/*
 * No administrative page is indexable.
 *
 * `/knowledge` was: unlinked from the navigation, gated at the API by
 * INGEST_SECRET, and missing the one line every other admin surface carries. A
 * page headed "Administración" with a secret field was eligible to appear in a
 * search for this product's name. Nothing leaks through it, and that is not the
 * whole of the cost — it invites people to try, and it is the sort of result
 * that makes somebody deciding whether to pay wonder what else is loose.
 *
 * Derived rather than listed: every page under `admin/`, plus any other page
 * whose own copy calls it administration. A new one inherits the rule instead of
 * needing to be remembered.
 */
describe('administrative pages', () => {
  const appDir = path.join(ROOT, 'src', 'app');

  function pages(dir: string, found: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'api') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) pages(full, found);
      else if (entry.name === 'page.tsx') found.push(full);
    }
    return found;
  }

  const all = pages(appDir);

  it('found the pages it is meant to check', () => {
    assert.ok(all.length >= 8, `only ${all.length} pages found under src/app`);
  });

  it('are all noindex', () => {
    const leaky: string[] = [];
    for (const file of all) {
      const source = readFileSync(file, 'utf8');
      const isAdmin =
        file.includes(`${path.sep}admin${path.sep}`) || /Administración/.test(source);
      if (!isAdmin) continue;
      if (!/robots:\s*\{[^}]*index:\s*false/.test(source)) leaky.push(path.relative(ROOT, file));
    }
    assert.deepEqual(leaky, [], `administrative pages a search engine may index: ${leaky.join(', ')}`);
  });
});
