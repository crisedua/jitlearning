/**
 * Print the SQL that still needs running, in order, as one paste.
 *
 *   npm run sql              # every migration this product introduced
 *   npm run sql -- 20260810  # from that migration onward
 *
 * The migrations are already in the repo and already numbered, so this adds no
 * new source of truth: it concatenates the files. It exists because "run these six
 * files in the SQL editor" is a step people do five sixths of, and a half-migrated
 * database fails in ways that look like application bugs.
 *
 * Every file this concatenates is written to be idempotent — `create table if not
 * exists`, `add column if not exists`, `drop policy if exists` before create — so
 * re-running the whole set is safe and is the recommended way to use this.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Where the product changed shape. Everything from here is worth re-running.
 *
 * Migrations *before* this are assumed already applied, which is true for a
 * deployment that has been running, and is a trap for a fresh one: nothing in the
 * bundle creates `profiles`, `plans`, `coach_sessions` or `feedback`. `npm run
 * doctor` probes for each of those and names the file, which is the safety net.
 * Pass an earlier prefix to widen the bundle.
 */
const DEFAULT_FROM = '20260808';

async function main() {
  const from = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? DEFAULT_FROM;
  const dir = path.join(process.cwd(), 'supabase', 'migrations');

  const files = (await readdir(dir))
    .filter((f) => f.endsWith('.sql') && f >= from)
    .sort();

  if (files.length === 0) {
    console.error(`No migrations at or after ${from}.`);
    process.exit(1);
  }

  const header = [
    '-- ModoJIT: paste this whole file into the Supabase SQL editor and run it.',
    '--',
    `-- ${files.length} migration(s), in order, all of them idempotent:`,
    ...files.map((f) => `--   ${f}`),
    '--',
    '-- Safe to run more than once. Safe to run on a database where some of these',
    '-- have already been applied.',
    '--',
    '-- It does NOT include the migrations that create profiles, plans, coach_sessions',
    '-- or feedback: those predate this set and are assumed applied. On a fresh',
    '-- database run `npm run sql -- 20260730` instead, or let `npm run doctor` tell',
    '-- you which one is missing.',
    '',
  ].join('\n');

  const bodies = await Promise.all(
    files.map(async (f) => {
      const sql = await readFile(path.join(dir, f), 'utf8');
      return [
        '',
        `-- ${'='.repeat(74)}`,
        `-- ${f}`,
        `-- ${'='.repeat(74)}`,
        '',
        sql.trimEnd(),
        '',
      ].join('\n');
    }),
  );

  process.stdout.write(header + bodies.join('\n'));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
