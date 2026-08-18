/**
 * The contract between the TypeScript and the SQL, checked by something.
 *
 * This project has already been broken once by a disagreement across that line:
 * `plan_steps.level` carried a check constraint listing level names the code had
 * renamed, so Postgres rejected every plan insert, `progress.ts` failed soft as
 * designed, and the progress page was empty for everybody with no error anywhere.
 * `curriculum.test.ts` now pins that particular pair.
 *
 * This file pins the other half of the same class. Every `upsert(..., {
 * onConflict: 'a,b' })` in the codebase is a promise that a unique constraint or
 * primary key exists on exactly those columns. When it does not, Postgres raises
 * 42P10 rather than writing the row, and every one of these call sites logs and
 * continues, because a failed webhook write must not take down a conversation.
 * So the failure is total and silent, which is the same shape as last time:
 *
 *   session_summaries   no row -> no commitment -> the teacher opens every
 *                       session as though it were the first
 *   plan_steps          no row -> no plan, no measured minutes, no offer
 *   career_profiles     no row -> the teacher never learns who it is talking to
 *
 * Nothing else can catch it. TypeScript does not read SQL, the test suite has no
 * database, and the call sites are written to survive exactly this error.
 *
 * The parsing below is deliberately literal about this repository's SQL style
 * rather than general: a real parser would be a dependency, and the assertion at
 * the end is only as good as its inputs, so the test fails loudly if it finds no
 * tables or no call sites to check.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { MIGRATION_SENSITIVE } from './schema';

/** The repo root. `process.cwd()` is where npm test runs, which is the root. */
const ROOT = process.cwd();

/** Every file that might contain a Supabase call, source only. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Unique column sets per table, from the migrations.
 *
 * Collects, in this repo's four styles: a column line ending `primary key`, a
 * column line ending `unique`, a table-level `unique (a, b)`, and the
 * `alter table ... add constraint ... unique (...)` form used to retrofit a
 * constraint onto a table that already exists.
 */
function uniqueSets(): Map<string, Set<string>[]> {
  const dir = path.join(ROOT, 'supabase', 'migrations');
  const sets = new Map<string, Set<string>[]>();

  const add = (table: string, cols: string[]) => {
    const list = sets.get(table) ?? [];
    list.push(new Set(cols.map((c) => c.trim()).filter(Boolean)));
    sets.set(table, list);
  };

  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.sql')) continue;
    const sql = readFileSync(path.join(dir, file), 'utf8');

    // create table public.X ( ... );
    for (const m of sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\);/gi,
    )) {
      const table = m[1]!;
      for (const line of m[2]!.split('\n')) {
        const clean = line.split('--')[0]!.trim().replace(/,$/, '');
        if (!clean) continue;

        const tableLevel = clean.match(/^unique\s*\(([^)]*)\)/i);
        if (tableLevel) {
          add(table, tableLevel[1]!.split(','));
          continue;
        }
        const col = clean.match(/^(\w+)\s+.*\b(primary\s+key|unique)\b/i);
        if (col) add(table, [col[1]!]);
      }
    }

    // alter table public.X add constraint ... unique (a, b);
    for (const m of sql.matchAll(
      /alter\s+table\s+(?:public\.)?(\w+)[\s\S]*?add\s+constraint\s+\w+\s+unique\s*\(([^)]*)\)/gi,
    )) {
      add(m[1]!, m[2]!.split(','));
    }

    // alter table public.X add column if not exists col type unique;
    for (const m of sql.matchAll(
      /alter\s+table\s+(?:public\.)?(\w+)([\s\S]*?);/gi,
    )) {
      const table = m[1]!;
      for (const c of m[2]!.matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)[^,;]*\bunique\b/gi)) {
        add(table, [c[1]!]);
      }
    }
  }

  return sets;
}

/** Every `onConflict`, with the table of the nearest preceding `.from(...)`. */
function conflictTargets(): { file: string; table: string; columns: string[] }[] {
  const found: { file: string; table: string; columns: string[] }[] = [];

  for (const file of [...sourceFiles(path.join(ROOT, 'src')), ...sourceFiles(path.join(ROOT, 'scripts'))]) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/onConflict:\s*'([^']+)'/g)) {
      const before = text.slice(0, m.index);
      const from = [...before.matchAll(/\.from\(\s*'(\w+)'/g)].pop();
      assert.ok(from, `${path.relative(ROOT, file)}: onConflict with no .from() before it`);
      found.push({
        file: path.relative(ROOT, file),
        table: from[1]!,
        columns: m[1]!.split(',').map((c) => c.trim()),
      });
    }
  }

  return found;
}

describe('every onConflict has a constraint behind it', () => {
  const sets = uniqueSets();
  const targets = conflictTargets();

  it('found the schema and the call sites, so the assertions below mean something', () => {
    assert.ok(sets.size >= 5, `parsed only ${sets.size} tables out of the migrations`);
    assert.ok(targets.length >= 5, `found only ${targets.length} onConflict call sites`);
  });

  for (const { file, table, columns } of targets) {
    it(`${table} (${columns.join(', ')}) in ${file}`, () => {
      const available = sets.get(table);
      assert.ok(
        available,
        `${table} has no create table in supabase/migrations, so the upsert writes nowhere`,
      );

      const wanted = new Set(columns);
      const match = available.some(
        (s) => s.size === wanted.size && [...wanted].every((c) => s.has(c)),
      );

      assert.ok(
        match,
        `${table} has no unique constraint on (${columns.join(', ')}). ` +
          `Postgres raises 42P10 and the call site logs and continues, so this ` +
          `write fails silently forever. Constraints found: ` +
          `${available.map((s) => `(${[...s].join(', ')})`).join(' ') || 'none'}`,
      );
    });
  }
});

/**
 * The health endpoint's schema list, checked against the migrations.
 *
 * `/api/health` reports a deployment as broken when any of these columns is
 * missing. A typo in the list would make it report that forever, on a database
 * that is perfectly fine — and a check that cries wolf is worse than no check,
 * because the next real failure is read as noise.
 *
 * So the list has to name columns the migrations actually create.
 */
describe('the columns the health endpoint watches', () => {
  const sql = readdirSync(path.join(ROOT, 'supabase', 'migrations'))
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(path.join(ROOT, 'supabase', 'migrations', f), 'utf8'))
    .join('\n');

  it('watches something', () => {
    assert.ok(MIGRATION_SENSITIVE.length >= 5);
  });

  for (const { table, column } of MIGRATION_SENSITIVE) {
    it(`${table}.${column} is created by a migration`, () => {
      /*
       * Either the table is created with the column in its body, or the column
       * is added later. Both forms appear in this repo, and a column added by a
       * later migration is exactly the case worth catching: the table exists,
       * so a table-level check would pass on a half-migrated database.
       */
      const created = new RegExp(
        `create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:public\\.)?${table}\\s*\\(([\\s\\S]*?)\\n\\);`,
        'i',
      ).exec(sql);
      const inBody = created ? new RegExp(`^\\s*${column}\\s`, 'im').test(created[1]!) : false;

      const added = new RegExp(
        `alter\\s+table\\s+(?:public\\.)?${table}[\\s\\S]*?add\\s+column\\s+(?:if\\s+not\\s+exists\\s+)?${column}\\b`,
        'i',
      ).test(sql);

      assert.ok(
        inBody || added,
        `no migration creates ${table}.${column}, so /api/health would report every deployment broken`,
      );
    });
  }
});
