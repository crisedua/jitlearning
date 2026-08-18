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

      /*
       * Views count too. `plan_usage_total` is one, and it is the entry whose
       * absence costs money rather than a feature, so leaving it unwatched
       * because the parser only understood tables would be the wrong trade.
       * A projected column appears in the select list, either aliased or as
       * `alias.column`.
       */
      const view = new RegExp(
        `create\\s+(?:or\\s+replace\\s+)?view\\s+(?:public\\.)?${table}\\s+as([\\s\\S]*?);`,
        'i',
      ).exec(sql);
      const projected = view
        ? new RegExp(`(?:^|[\\s.,])${column}\\b`, 'im').test(view[1]!)
        : false;

      assert.ok(
        inBody || added || projected,
        `no migration creates ${table}.${column} (checked as table, added column and view), ` +
          `so /api/health would report every deployment broken`,
      );
    });
  }
});

/**
 * The read that decides whether somebody is a paying customer.
 *
 * `subscriptionFor` resolves the plan, and `/progreso` treats a missing Stripe
 * customer as a courtesy plan: it hides the billing link and says there is
 * nothing to cancel. So every column in that select is load-bearing for a
 * paying customer's ability to manage their own subscription, and the select is
 * all-or-nothing — one unknown column fails the lot with 42703.
 *
 * That happened. A column added three migrations later was folded into the same
 * select, so a database with billing and without grants reported every paying
 * customer as comped. The fix was to read the newer column separately; this
 * keeps it that way.
 */
describe('resolving a subscription survives a partly migrated database', () => {
  /** The migration that adds the billing columns this read is allowed to need. */
  const BILLING = '20260813000000_billing.sql';

  it('selects nothing newer than the billing migration', () => {
    const source = readFileSync(path.join(ROOT, 'src', 'lib', 'billing.ts'), 'utf8');
    const start = source.indexOf('export async function subscriptionFor');
    assert.ok(start > 0, 'subscriptionFor not found');

    const select = /\.select\('([^']+)'\)/.exec(source.slice(start));
    assert.ok(select, 'no select found in subscriptionFor');
    const columns = select[1]!.split(',').map((c) => c.trim());
    assert.ok(columns.length >= 4, `only ${columns.length} columns parsed`);

    const files = readdirSync(path.join(ROOT, 'supabase', 'migrations'))
      .filter((f) => f.endsWith('.sql') && f <= BILLING)
      .sort();
    const allowed = files
      .map((f) => readFileSync(path.join(ROOT, 'supabase', 'migrations', f), 'utf8'))
      .join('\n');

    for (const column of columns) {
      assert.ok(
        new RegExp(`\\b${column}\\b`).test(allowed),
        `subscriptionFor selects "${column}", which no migration up to ${BILLING} creates. ` +
          `One unknown column fails the whole read, and the fallback reports every paying ` +
          `customer as comped. Read it separately instead.`,
      );
    }
  });
});

/*
 * Migration versions have to be unique.
 *
 * Supabase keys applied migrations by the numeric prefix, not the filename, so
 * two files sharing one version are one version: `supabase db push` records it
 * as applied after the first and the second never runs. `npm run sql` prints
 * both, which makes the mistake invisible to anybody pasting into the SQL
 * editor and fatal to anybody using the CLI, and the symptom arrives much later
 * as a missing table on one deployment and not another.
 *
 * Written after doing it: 20260816000000_purchase_intent.sql was added beside
 * an existing 20260816000000_plan_grants.sql, and nothing anywhere objected.
 */
describe('migration versions', () => {
  it('are unique across every file', () => {
    const files = readdirSync(path.join(ROOT, 'supabase', 'migrations')).filter((f) =>
      f.endsWith('.sql'),
    );
    const seen = new Map<string, string>();
    for (const file of files) {
      const version = file.split('_')[0]!;
      const first = seen.get(version);
      assert.equal(
        first,
        undefined,
        `${file} and ${first} share version ${version}: the second would never run.`,
      );
      seen.set(version, file);
    }
    assert.ok(files.length > 0, 'no migrations found, so this test proved nothing');
  });
});

/*
 * The migrations have to survive being run in order, on an empty database.
 *
 * `npm run sql` concatenates every file in filename order and the operator
 * pastes the lot into the SQL editor in one go. Postgres stops at the first
 * error, so a file that touches a table an earlier file has not created yet
 * does not fail alone: everything after it is skipped too, and what is left is
 * a half-applied schema — the exact state `MIGRATION_SENSITIVE` above exists to
 * detect after the fact.
 *
 * This checks it before the fact, which is cheaper than a half-migrated
 * production database and a person reading /admin/estado trying to work out
 * which of seventeen files did not run.
 *
 * Only the ordering property. Whether the SQL is valid is Postgres's job; this
 * catches the mistake that is invisible in review, because each file is
 * perfectly correct on its own and only the sequence is wrong.
 */
describe('migrations in order', () => {
  const dir = path.join(ROOT, 'supabase', 'migrations');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  it('never touch a table before it is created', () => {
    const created = new Set<string>();
    const problems: string[] = [];

    for (const file of files) {
      const sql = readFileSync(path.join(dir, file), 'utf8');
      // Comments carry prose about tables that do not exist yet, and one of
      // them is a paragraph about `purchase_intents` written before the create.
      const code = sql.replace(/--[^\n]*/g, '');

      for (const m of code.matchAll(/create table if not exists public\.([a-z_]+)/g)) {
        created.add(m[1]!);
      }
      // Views are created from tables and altered like them.
      for (const m of code.matchAll(/create (or replace )?view public\.([a-z_]+)/g)) {
        created.add(m[2]!);
      }

      for (const pattern of [
        /alter table (?:only )?public\.([a-z_]+)/g,
        /references public\.([a-z_]+)/g,
        /create index if not exists [a-z_]+\s+on public\.([a-z_]+)/g,
        // Added when a migration started granting column privileges: a grant on
        // a table an earlier file has not created fails the paste the same way
        // an alter does, and takes everything after it down with it.
        /(?:grant|revoke)[\s\S]{0,120}?\son public\.([a-z_]+)/g,
      ]) {
        for (const m of code.matchAll(pattern)) {
          const table = m[1]!;
          if (!created.has(table)) problems.push(`${file} touches ${table} before it exists`);
        }
      }
    }

    assert.deepEqual(problems, [], problems.join('\n'));
  });

  /*
   * Re-running the paste has to be safe.
   *
   * The first paste is rarely the only one: a file fails, it gets fixed, the
   * whole thing goes in again. Every table and column here is written `if not
   * exists` for that reason, but Postgres has no `create policy if not exists`,
   * so an unguarded policy turns the second paste into an error at the first
   * table that already has one — and the operator, who is now debugging a
   * schema they cannot see, has no reason to suspect the file they already ran.
   *
   * All fifteen are currently guarded. This is here so the sixteenth is too.
   */
  it('can be pasted twice, so every policy is dropped before it is created', () => {
    const problems: string[] = [];

    for (const file of files) {
      const sql = readFileSync(path.join(dir, file), 'utf8').replace(/--[^\n]*/g, '');
      const drops = new Map<string, number>();
      for (const m of sql.matchAll(/drop policy if exists "([^"]+)"\s+on public\.([a-z_]+)/g)) {
        drops.set(`${m[1]}|${m[2]}`, m.index!);
      }
      for (const m of sql.matchAll(/create policy "([^"]+)"\s+on public\.([a-z_]+)/g)) {
        const key = `${m[1]}|${m[2]}`;
        const dropped = drops.get(key);
        if (dropped === undefined) {
          problems.push(`${file}: policy "${m[1]}" on ${m[2]} is created without a drop`);
        } else if (dropped > m.index!) {
          problems.push(`${file}: policy "${m[1]}" is dropped after it is created`);
        }
      }
    }

    assert.deepEqual(problems, [], problems.join('\n'));
  });

  it('has something to check', () => {
    assert.ok(files.length >= 10, `only ${files.length} migrations found`);
  });
});

/*
 * A learner may only write what a form on the page actually writes.
 *
 * The policies grant UPDATE per row, so every column of a granted table is
 * writable from the browser with the anon key, which is public. That was fine
 * while the only writable thing was a text box; it stopped being fine when the
 * page gained a number that feeds the headline, and it was never fine on
 * `career_profiles`, which no form touches at all.
 *
 * This pins the list rather than the mechanism: adding a policy that lets a
 * learner update a table has to be a decision somebody makes on purpose, with
 * the column grant beside it, not something inherited from a migration written
 * before the page had forms.
 */
describe('what a learner may update', () => {
  const dir = path.join(ROOT, 'supabase', 'migrations');
  const sql = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(path.join(dir, f), 'utf8').replace(/--[^\n]*/g, ''))
    .join('\n');

  /** Tables whose learner-facing UPDATE policy is still standing at the end. */
  const writable = new Set<string>();
  for (const m of sql.matchAll(
    /create policy "([^"]+)"\s+on public\.([a-z_]+)\s+for update\s+to authenticated/g,
  )) {
    writable.add(m[2]!);
  }
  for (const m of sql.matchAll(/drop policy if exists "[^"]+" on public\.([a-z_]+);(?![\s\S]{0,200}?create policy[^;]*on public\.\1\s+for update)/g)) {
    // A drop with no create after it retires the policy.
    if (!new RegExp(`create policy "[^"]+"\\s+on public\\.${m[1]}\\s+for update`).test(
      sql.slice(m.index!),
    )) {
      writable.delete(m[1]!);
    }
  }

  it('is exactly the two tables the progress page has forms for', () => {
    assert.deepEqual([...writable].sort(), ['plan_steps', 'session_summaries']);
  });

  it('grants columns on each of them, so status is not writable by hand', () => {
    for (const table of writable) {
      assert.match(
        sql,
        new RegExp(`revoke update on public\\.${table} from authenticated`),
        `${table} keeps table-wide UPDATE, so a learner can write every column of it`,
      );
      assert.match(sql, new RegExp(`grant update \\([a-z_, \\n]+\\)\\s+on public\\.${table}`));
    }
  });
});

/*
 * Nobody may read somebody else's row.
 *
 * `/privacidad` now says this in public: "la base de datos está cerrada por
 * usuario, así que otra persona con cuenta no puede leer lo tuyo". That moved it
 * from an implementation detail to a promise, and a promise on a page is worth
 * exactly what enforces it.
 *
 * Two ways it can break, and neither shows up anywhere else. A policy written
 * without `auth.uid()` reads every row to every signed-in visitor. And a policy
 * on a table with RLS never enabled does nothing at all — Postgres accepts it,
 * the migration succeeds, the policy sits there looking correct, and the table
 * is wide open.
 *
 * The check itself has to be careful: these migrations align their statements
 * with runs of spaces, and a regex expecting one space reported RLS missing on
 * `profiles`, which holds every email and Stripe customer id in the product.
 * That was wrong, and it is the shape of mistake that would otherwise get
 * "fixed" by loosening something.
 */
describe('learner data is closed by user', () => {
  const dir = path.join(ROOT, 'supabase', 'migrations');
  const sql = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(path.join(dir, f), 'utf8').replace(/--[^\n]*/g, ''))
    .join('\n');

  /** Every table in these migrations that holds something belonging to a person. */
  const PERSONAL = [
    'profiles',
    'coach_sessions',
    'career_profiles',
    'plan_steps',
    'session_summaries',
    'feedback',
    'purchase_intents',
    'billing_events',
  ];

  it('names tables that exist, so a rename cannot empty this check', () => {
    for (const table of PERSONAL) {
      assert.match(sql, new RegExp(`create table if not exists public\\.${table}\\b`), table);
    }
  });

  it('enables row level security on each of them', () => {
    for (const table of PERSONAL) {
      assert.match(
        sql,
        new RegExp(`alter table public\\.${table}\\s+enable row level security`),
        `${table} has no RLS, so any policy on it is decoration and the table is open`,
      );
    }
  });

  it('scopes every client-readable policy to the signed-in user', () => {
    for (const table of PERSONAL) {
      const policies = [
        ...sql.matchAll(
          new RegExp(
            `create policy "([^"]+)"\\s+on public\\.${table}\\s+for select\\s+to (\\w+)([\\s\\S]{0,240}?);`,
            'g',
          ),
        ),
      ];

      for (const [, name, role, body] of policies) {
        assert.notEqual(role, 'anon', `"${name}" lets anybody read ${table}`);
        assert.match(
          body,
          /auth\.uid\(\)/,
          `"${name}" on ${table} reads every row to every signed-in visitor`,
        );
      }
    }
  });
});
