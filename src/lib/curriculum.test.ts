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
import { LEVELS, PATHS, WEEKLY_MAX, WEEKLY_MIN, buildPlan, isWeeklyTask, type PathId, weeklyLessonId } from './curriculum';

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

/**
 * The identity of one of the learner's own tasks.
 *
 * A weekly step carries the two numbers the whole value claim rests on, so its
 * id has to name the task and nothing else. When the id was the position in an
 * array, and `upsertProfile` replaces that array wholesale, "step one" could
 * come to mean a different task between one conversation and the next while the
 * measured minutes stayed put.
 */
describe('naming a weekly task', () => {
  it('gives the same task the same id every time', () => {
    assert.equal(
      weeklyLessonId('Responder correos de proveedores'),
      weeklyLessonId('Responder correos de proveedores'),
    );
  });

  it('does not depend on where the task sits in the list', () => {
    const a = buildPlan({ weeklyTasks: ['Tarea uno', 'Tarea dos'], path: 'mejorar' });
    const b = buildPlan({ weeklyTasks: ['Tarea dos', 'Tarea uno'], path: 'mejorar' });

    const idOf = (plan: typeof a, task: string) =>
      plan.find((s) => s.linkedTask === task)!.lessonId;

    assert.equal(idOf(a, 'Tarea uno'), idOf(b, 'Tarea uno'));
    assert.equal(idOf(a, 'Tarea dos'), idOf(b, 'Tarea dos'));
  });

  it('ignores case, accents and spacing, which a transcript will vary', () => {
    assert.equal(weeklyLessonId('Informe  Semanal'), weeklyLessonId('informe semanal'));
    assert.equal(weeklyLessonId('Cotizacion'), weeklyLessonId('Cotización'));
  });

  it('gives different tasks different ids', () => {
    const seen = new Set(
      ['Responder correos', 'Armar el informe', 'Cotizar', 'Actualizar la planilla'].map(
        weeklyLessonId,
      ),
    );
    assert.equal(seen.size, 4);
  });

  it('is still recognisable as a weekly task', () => {
    // isWeeklyTask gates whether the minutes are written at all.
    assert.ok(isWeeklyTask(weeklyLessonId('Cualquier tarea')));
  });

  it('adding a task leaves the existing ones untouched', () => {
    // The whole point: re-running buildPlan after the learner names a second
    // task must not renumber the first, because the first carries its minutes.
    const before = buildPlan({ weeklyTasks: ['Responder correos'], path: 'mejorar' });
    const after = buildPlan({
      weeklyTasks: ['Responder correos', 'Armar el informe'],
      path: 'mejorar',
    });

    const first = before.find((s) => s.linkedTask === 'Responder correos')!;
    const same = after.find((s) => s.linkedTask === 'Responder correos')!;
    assert.equal(first.lessonId, same.lessonId);
    assert.equal(after.filter((s) => isWeeklyTask(s.lessonId)).length, 2);
  });
});

/**
 * What the offer promises is what the plan contains.
 *
 * The paragraph on /progreso that asks for money says the plan covers the
 * learner's weekly tasks "y los otros N niveles, hasta el portafolio", with N
 * derived from LEVELS rather than written out. It used to name only level 2 and
 * the portfolio, which described eleven of the fourteen steps somebody would
 * actually get — understating the product in the one place it asks to be paid,
 * and omitting the level that turns a task done with AI into a repeatable flow.
 *
 * Deriving the number fixes the drift; this pins the assumption underneath it,
 * that a real plan actually spans every level.
 */
describe('the offer describes the plan it is selling', () => {
  const plan = buildPlan({
    weeklyTasks: Array.from({ length: WEEKLY_MAX }, (_, i) => `Tarea ${i + 1}`),
    path: 'mejorar',
  });

  it('a full plan reaches every level', () => {
    const reached = new Set(plan.map((s) => s.level));
    for (const level of LEVELS) {
      assert.ok(
        reached.has(level.id),
        `level "${level.id}" produces no steps, so the offer counts a level nobody gets`,
      );
    }
  });

  it('the weekly steps are as many as the learner named', () => {
    assert.equal(plan.filter((s) => isWeeklyTask(s.lessonId)).length, WEEKLY_MAX);
  });

  it('the minimum the offer quotes is a plan that can actually be built', () => {
    const smallest = buildPlan({
      weeklyTasks: Array.from({ length: WEEKLY_MIN }, (_, i) => `Tarea ${i + 1}`),
      path: 'mejorar',
    });
    assert.equal(smallest.filter((s) => isWeeklyTask(s.lessonId)).length, WEEKLY_MIN);
    assert.ok(smallest.length > WEEKLY_MIN, 'a minimal plan is only the weekly tasks');
  });
});
