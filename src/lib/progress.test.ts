/**
 * The arithmetic the product's only value claim rests on.
 *
 * `timeSaved` produces the number on the progress page, in the offer beside it,
 * and in the sentence the teacher says out loud at the start of the next session.
 * If it is wrong, every one of those is wrong, and it is wrong in the direction
 * that matters most: a learner told they recovered hours they did not.
 *
 * Pure over its input, so it can be tested exactly. No database, no network.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { currentStep, matchStep, timeSaved, type PlanStep } from './progress';
import { buildPlan, LEVELS, WEEKLY_MAX } from './curriculum';

let seq = 0;
function step(over: Partial<PlanStep> = {}): PlanStep {
  seq += 1;
  return {
    id: `s${seq}`,
    lessonId: `sem-0${seq}`,
    level: 'semana',
    title: 'Una tarea, resuelta',
    linkedTask: 'una tarea',
    status: 'done',
    evidence: null,
    commitment: null,
    commitmentDate: null,
    position: seq,
    minutesBefore: 90,
    minutesAfter: 25,
    ...over,
  };
}

describe('what the learner recovered', () => {
  it('sums before minus after across finished weekly tasks', () => {
    const saved = timeSaved([step(), step({ minutesBefore: 40, minutesAfter: 10 })]);
    assert.equal(saved.perWeek, 65 + 30);
    assert.equal(saved.tasksMeasured, 2);
  });

  it('ignores a task that is measured but not finished', () => {
    // A measurement taken during an experiment is not a change to somebody's week.
    const saved = timeSaved([step({ status: 'in_progress' }), step({ status: 'pending' })]);
    assert.equal(saved.perWeek, 0);
    assert.equal(saved.tasksMeasured, 0);
  });

  it('ignores a finished task with only one of the two numbers', () => {
    assert.equal(timeSaved([step({ minutesAfter: null })]).perWeek, 0);
    assert.equal(timeSaved([step({ minutesBefore: null })]).perWeek, 0);
  });

  it('ignores levels that are not the learner’s own tasks', () => {
    // A fundamentals lesson saves no weekly minutes, and counting one would put
    // invented hours on the page.
    const saved = timeSaved([step({ level: 'criterio' }), step({ level: 'flujo' })]);
    assert.equal(saved.perWeek, 0);
  });

  it('never subtracts below zero when the task got slower', () => {
    // Real and worth handling: the first attempt with a new tool can be slower.
    // It contributes nothing rather than a negative, and still counts as measured
    // because the learner did measure it.
    const saved = timeSaved([step({ minutesBefore: 20, minutesAfter: 35 })]);
    assert.equal(saved.perWeek, 0);
    assert.equal(saved.tasksMeasured, 1);
  });

  it('handles no steps at all', () => {
    assert.deepEqual(timeSaved([]), { perWeek: 0, tasksMeasured: 0 });
  });
});

describe('where the learner is in the plan', () => {
  it('points at the first step that is not done, numbered from 1', () => {
    const steps = [step(), step({ status: 'pending' }), step({ status: 'pending' })];
    const current = currentStep(steps);
    assert.equal(current?.number, 2);
    assert.equal(current?.step.id, steps[1]!.id);
  });

  it('returns null once every step is done', () => {
    assert.equal(currentStep([step(), step()]), null);
  });

  it('treats in_progress as where they are, not as done', () => {
    assert.equal(currentStep([step({ status: 'in_progress' })])?.number, 1);
  });
});

describe('the plan built from the diagnostic', () => {
  it('puts the privacy guardrail before any of the learner’s own work', () => {
    const plan = buildPlan({ weeklyTasks: ['cerrar el reporte'], path: 'mejorar' });
    assert.equal(plan[0]!.lessonId, 'seg-01-privacidad');
    // Not a preference: the next thing that happens is pasting a real document
    // into a chat, so the rule about what never goes in there has to come first.
    const firstTask = plan.findIndex((s) => s.linkedTask !== null);
    assert.ok(firstTask > 0, 'a weekly task came before the guardrail');
  });

  it('makes one step per weekly task, capped', () => {
    const many = Array.from({ length: 9 }, (_, i) => `tarea ${i + 1}`);
    const tasks = buildPlan({ weeklyTasks: many, path: 'mejorar' }).filter(
      (s) => s.linkedTask !== null,
    );
    assert.equal(tasks.length, WEEKLY_MAX);
  });

  it('drops blank tasks rather than making an empty lesson', () => {
    const plan = buildPlan({ weeklyTasks: ['  ', '', 'real'], path: 'mejorar' });
    const tasks = plan.filter((s) => s.linkedTask !== null);
    assert.deepEqual(tasks.map((t) => t.linkedTask), ['real']);
  });

  it('still produces a walkable plan when no path was chosen', () => {
    const plan = buildPlan({ weeklyTasks: ['una'], path: null });
    for (const level of LEVELS) {
      assert.ok(
        plan.some((s) => s.level === level.id),
        `no step at level ${level.id} when the path is unknown`,
      );
    }
  });

  it('keeps the levels in curriculum order', () => {
    const plan = buildPlan({ weeklyTasks: ['una', 'otra'], path: 'propio' });
    const order = LEVELS.map((l) => l.id);
    const seen = plan.map((s) => order.indexOf(s.level));
    assert.deepEqual(seen, [...seen].sort((a, b) => a - b), 'levels are out of order');
  });
});

describe('matching the lesson the teacher says it taught', () => {
  const plan: PlanStep[] = [
    step({ id: 'a', lessonId: 'sem-01', title: 'Cerrar el reporte mensual, resuelta' }),
    step({ id: 'b', lessonId: 'sem-02', title: 'Responder correos de proveedores, resuelta' }),
    // Real lesson ids: the id fallback checks them against the curriculum, so a
    // made-up one is correctly ignored.
    step({ id: 'c', lessonId: 'cri-01-contexto', title: 'Por qué el contexto cambió la respuesta' }),
    step({ id: 'd', lessonId: 'cri-02-pedir-bien', title: 'Pedir bien: instrucción, contexto, formato' }),
  ];

  it('matches the exact title', () => {
    assert.equal(matchStep(plan, 'Cerrar el reporte mensual, resuelta')?.id, 'a');
  });

  it('ignores case, accents and punctuation, which the transcript will vary', () => {
    assert.equal(matchStep(plan, 'POR QUE EL CONTEXTO CAMBIO LA RESPUESTA')?.id, 'c');
  });

  it('matches a paraphrase that contains the title', () => {
    assert.equal(
      matchStep(plan, 'hoy hicimos "Responder correos de proveedores, resuelta" juntos')?.id,
      'b',
    );
  });

  it('refuses an ambiguous word rather than picking the first', () => {
    // "contexto" appears in two titles. Guessing would mark the wrong lesson done
    // and attribute the minutes to work the learner never did.
    assert.equal(matchStep(plan, 'contexto'), null);
  });

  it('refuses an extraction that normalises to nothing', () => {
    // The bug this guards: ''.includes('') is true, so these used to match the
    // first step in the plan and write minutes onto it.
    for (const junk of ['...', '?', '-', '   ', '1']) {
      assert.equal(matchStep(plan, junk), null, `'${junk}' matched something`);
    }
  });

  it('refuses a needle too short to mean anything', () => {
    assert.equal(matchStep(plan, 'el'), null);
    assert.equal(matchStep(plan, 'de'), null);
  });

  it('returns null when nothing resembles it, so the caller keeps the current step', () => {
    assert.equal(matchStep(plan, 'algo que no está en el plan'), null);
  });

  it('falls back to the lesson id when the teacher reads it out', () => {
    // Both sides are normalised, so the hyphens do not have to survive the
    // transcript. They did not before, which made this branch unreachable.
    assert.equal(matchStep(plan, 'terminamos cri-02-pedir-bien hoy')?.id, 'd');
  });

  it('ignores a lesson id that is not in the curriculum', () => {
    const bogus = [step({ id: 'x', lessonId: 'inventado-99', title: 'Algo' })];
    assert.equal(matchStep(bogus, 'hicimos inventado-99'), null);
  });
});
