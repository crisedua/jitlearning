/**
 * The sign-up's three values, pinned across the TypeScript/SQL line.
 *
 * `signups.employment` carries a check constraint listing the same ids as
 * `EMPLOYMENT`, and nothing in the language keeps them in step: SQL cannot
 * import TypeScript, `next build` does not read migrations, and the route's
 * insert fails soft enough to be missed — it returns a 500 the person reads as
 * "inténtalo de nuevo" and logs one line nobody is watching.
 *
 * This project has already paid for that exact disagreement once. `plan_steps`
 * had a constraint listing level names the code had renamed, so Postgres
 * rejected every insert, `progress.ts` logged and carried on as designed, and
 * the progress page was empty for everybody with no error anywhere. Renaming
 * one of these three without editing the migration is the same commit.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { EMPLOYMENT, EMPLOYMENT_HINT, EMPLOYMENT_LABEL, normalisePhone } from './signup';

const MIGRATION = path.join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260825000000_signups.sql',
);

describe('the employment constraint', () => {
  const sql = readFileSync(MIGRATION, 'utf8');

  it('exists in the migration, so the comparison below means something', () => {
    assert.match(
      sql,
      /employment\s+text\s+not\s+null\s+check\s*\(/i,
      'no check constraint found on signups.employment',
    );
  });

  it('lists exactly the ids the code writes', () => {
    const clause = sql.match(/check\s*\(\s*employment\s+in\s*\(([^)]*)\)/i);
    assert.ok(clause, 'could not parse the employment check constraint');

    const inSql = [...clause[1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
    assert.deepEqual(
      [...inSql].sort(),
      [...EMPLOYMENT].sort(),
      'the check constraint and EMPLOYMENT disagree, so /api/signups will be refused ' +
        'by Postgres for at least one answer and nobody choosing it can register',
    );
  });
});

describe('every option can be rendered', () => {
  for (const id of EMPLOYMENT) {
    it(`${id} has a label and a hint`, () => {
      assert.ok(EMPLOYMENT_LABEL[id]?.trim(), `no label for ${id}`);
      assert.ok(EMPLOYMENT_HINT[id]?.trim(), `no hint for ${id}`);
    });
  }
});

describe('normalisePhone', () => {
  it('keeps the digits and drops the decoration', () => {
    assert.equal(normalisePhone(' 9 1234 5678 '), '912345678');
    assert.equal(normalisePhone('(56) 9-1234-5678'), '56912345678');
  });

  it('keeps a leading plus, because it is the difference between two numbers', () => {
    assert.equal(normalisePhone('+56 9 1234 5678'), '+56912345678');
  });

  it('does not invent one', () => {
    assert.equal(normalisePhone('56912345678'), '56912345678');
  });
});
