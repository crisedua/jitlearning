/**
 * The contract between the curriculum and the database.
 *
 * `plan_steps.level` carries a CHECK constraint listing the level ids, and
 * `LevelId` in `curriculum.ts` declares them. Nothing enforces that those two
 * lists agree: TypeScript does not read SQL, and the test suite has no database.
 *
 * They did in fact disagree. Inverting the curriculum renamed the levels in
 * TypeScript and left the constraint naming the old ones, so every plan insert
 * would have been rejected — and `progress.ts` fails soft by design, so the
 * symptom was not an error but an empty progress page, forever, for everybody.
 *
 * This is the compiler that join never had. It reads the migration and compares.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { LEVELS, buildPlan, PATHS, type PathId } from './curriculum';

const MIGRATIONS = path.join(process.cwd(), 'supabase', 'migrations');

/**
 * The level ids the database will accept, from the last migration that sets the
 * constraint. Last rather than first: a later migration can redefine it, and what
 * matters is the state after all of them have run.
 */
function constraintLevels(): string[] {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();

  let latest: string[] | null = null;
  for (const file of files) {
    const sql = readFileSync(path.join(MIGRATIONS, file), 'utf8');
    // Both the inline form in `create table` and a later `add constraint`.
    for (const m of sql.matchAll(/check\s*\(\s*level\s+in\s*\(([^)]*)\)/gi)) {
      latest = [...m[1]!.matchAll(/'([^']+)'/g)].map((q) => q[1]!);
    }
  }
  return latest ?? [];
}

describe('level ids agree between the curriculum and the database', () => {
  it('the constraint accepts every level the code declares', () => {
    const allowed = new Set(constraintLevels());
    assert.ok(allowed.size > 0, 'no level check constraint found in any migration');

    for (const level of LEVELS) {
      assert.ok(
        allowed.has(level.id),
        `plan_steps would reject level '${level.id}'. Add a migration that updates plan_steps_level_check.`,
      );
    }
  });

  it('the constraint allows nothing the code cannot produce', () => {
    const declared = new Set(LEVELS.map((l) => l.id));
    for (const allowed of constraintLevels()) {
      assert.ok(
        declared.has(allowed as (typeof LEVELS)[number]['id']),
        `the database still allows '${allowed}', which no level declares. Stale constraint.`,
      );
    }
  });

  it('every step buildPlan emits carries a level the database accepts', () => {
    const allowed = new Set(constraintLevels());
    for (const path of Object.keys(PATHS) as PathId[]) {
      const plan = buildPlan({ weeklyTasks: ['una', 'otra', 'tercera'], path });
      assert.ok(plan.length > 0, `${path} produced no plan`);
      for (const step of plan) {
        assert.ok(allowed.has(step.level), `${path}: step '${step.lessonId}' has level '${step.level}'`);
      }
    }
  });
});
