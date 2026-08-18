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
import {
  buildRecord,
  currentStep,
  isOverdue,
  learnerRecord,
  matchStep,
  opening,
  parseMinutes,
  planOrder,
  readStatus,
  timeSaved,
  type CareerProfile,
  type PlanStep,
  type SessionRecord,
} from './progress';
import { buildPlan, LEVELS, WEEKLY_MAX, weeklyLessonId } from './curriculum';

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

/**
 * The first sentence of every returning session.
 *
 * Said before the learner has had a chance to say anything, so there is no
 * recovery from getting it wrong and nothing in the logs when it happens. Every
 * piece of it is learner text that arrived through an extraction capped at 400
 * characters, which is far more than the opening has room for.
 */
describe('the spoken opening for a returning learner', () => {
  const profile = (over: Partial<CareerProfile> = {}): CareerProfile => ({
    role: 'analista de operaciones',
    field: null,
    sector: null,
    experienceYears: null,
    weeklyTasks: [],
    tools: [],
    aiUsage: null,
    goal: null,
    chosenPath: null,
    map: {},
    updatedAt: null,
    ...over,
  });

  const session = (over: Partial<SessionRecord> = {}): SessionRecord => ({
    id: 'c1',
    createdAt: '2026-08-01T10:00:00Z',
    lessonId: null,
    taught: null,
    commitment: null,
    commitmentDate: null,
    commitmentDone: null,
    ...over,
  });

  const at = (title: string) => ({ step: step({ title }), number: 4 });

  /** The 400-character kind the extractor is allowed to produce. */
  const LONG_COMMITMENT =
    'Armar el resumen semanal de operaciones con un asistente, revisarlo contra la ' +
    'planilla de pedidos, anotar qué tuve que corregir a mano y mandárselo al equipo ' +
    'comercial antes del viernes al mediodía, y de paso dejar anotado cuánto me demoré ' +
    'para poder compararlo con la semana pasada sin tener que acordarme de memoria.';

  it('keeps the question when the commitment is as long as the extractor allows', () => {
    // The bug this guards: a flat slice(0, 320) over the joined string cut the
    // opening mid-word and dropped "¿Lo hiciste?" entirely, so the teacher
    // greeted the learner, trailed off, and asked nothing.
    const said = opening(
      profile(),
      at('Responder los correos de proveedores que llegan fuera de horario'),
      session({ commitment: LONG_COMMITMENT }),
    );
    assert.ok(said.includes('¿Lo hiciste?'), said);
    assert.ok(said.length <= 320, `${said.length} chars: ${said}`);
  });

  it('never stops mid-word, whatever the input length', () => {
    for (const len of [80, 160, 240, 320, 400]) {
      const said = opening(
        profile({ role: 'a'.repeat(len % 120 || 40) }),
        at('t'.repeat(20) + ' ' + 'u'.repeat(len % 90 || 30)),
        session({ commitment: LONG_COMMITMENT.slice(0, len) }),
      );
      assert.ok(said.length <= 320, `${len}: ${said.length} chars`);
      // Ends on punctuation, not on a severed word.
      assert.match(said, /[.?]$/, `${len}: ${said}`);
    }
  });

  it('says the saving the way a person would, singular and all', () => {
    /*
     * The bug this guards: the opening had its own copy of the hour/minute
     * arithmetic, and that copy pluralised `hora` and never `minuto`. Sixty-one
     * minutes was spoken as "1 hora y 1 minutos" — to a returning learner, in
     * their first sentence, about the number the whole product rests on. Both
     * paths call `spellMinutes` now, so there is nothing left to diverge.
     */
    const said = (minutes: number) => opening(profile(), at('Una tarea'), null, minutes);
    assert.ok(said(61).includes('1 hora y 1 minuto cada semana'), said(61));
    assert.ok(!said(61).includes('1 minutos'), said(61));
    assert.ok(said(121).includes('2 horas y 1 minuto'), said(121));
    assert.ok(said(60).includes('1 hora cada semana'), said(60));
  });

  it('leads with the saving when there is one, and still closes on a question', () => {
    const said = opening(profile(), at('Una tarea'), session({ commitment: LONG_COMMITMENT }), 135);
    assert.ok(said.startsWith('Retomemos. Con lo que ya montaste recuperas 2 horas y 15 minutos'), said);
    assert.ok(said.includes('¿Lo hiciste?'), said);
  });

  it('asks anyway when the commitment is punctuation the extractor let through', () => {
    const said = opening(profile(), at('Una tarea'), session({ commitment: '...' }));
    assert.ok(!said.includes('Quedaste en .'), said);
    assert.match(said, /\?$/);
  });

  it('does not ask about a commitment the learner already reported done', () => {
    const said = opening(
      profile(),
      at('Una tarea'),
      session({ commitment: 'mandar el resumen', commitmentDone: true }),
    );
    assert.ok(!said.includes('Quedaste en'), said);
    assert.ok(said.includes('¿Estás frente al computador'), said);
  });

  it('still says something when there is no profile, no step and no commitment', () => {
    const said = opening(profile({ role: null }), null, null);
    assert.ok(said.length > 0);
    assert.match(said, /\?$/);
  });
});

/**
 * Whether the step counts as finished.
 *
 * The most expensive comparison in the product. `timeSaved` only counts steps
 * that are `done`, so a status that fails to parse means the learner's own
 * measurement is written to the database and never counted: empty progress page,
 * no recovered-hours line, and the offer that depends on it never made. Somebody
 * who did the work and reported the result is never asked to pay, and nothing
 * logs a problem.
 */
describe('reading how the step ended', () => {
  it('accepts the exact words the extraction prompt asks for', () => {
    assert.equal(readStatus('hecho'), 'done');
    assert.equal(readStatus('en_progreso'), 'in_progress');
  });

  it('survives the full stop a model puts on a one-word answer', () => {
    // The bug this guards: the comparison was against 'hecho' exactly, so
    // "Hecho." missed and the step silently stayed pending with the minutes
    // already written beside it.
    for (const said of ['Hecho.', 'HECHO!', 'hecho,', ' hecho ', 'Hecho']) {
      assert.equal(readStatus(said), 'done', said);
    }
  });

  it('treats underscore, space and hyphen as the same thing', () => {
    for (const said of ['en progreso', 'en_progreso', 'en-progreso', 'En Progreso.']) {
      assert.equal(readStatus(said), 'in_progress', said);
    }
  });

  it('accepts the near synonyms a transcript actually produces', () => {
    for (const said of ['listo', 'terminado', 'completada', 'resuelto']) {
      assert.equal(readStatus(said), 'done', said);
    }
  });

  it('refuses to guess from a word it does not know', () => {
    // Being too generous runs the other way: marking a step done that is not
    // inflates the saved-minutes total, the one number that has to be
    // defensible line by line.
    for (const said of ['sí', 'ok', 'bien', 'avanzó algo', 'casi hecho', 'no hecho', '?']) {
      assert.equal(readStatus(said), null, said);
    }
  });

  it('returns null for nothing, so the caller leaves the status alone', () => {
    assert.equal(readStatus(''), null);
    assert.equal(readStatus('   '), null);
    assert.equal(readStatus(null), null);
    assert.equal(readStatus(undefined), null);
  });

  it('a step that parses as done is one timeSaved will count', () => {
    // The two halves of the chain, pinned together: parsing 'Hecho.' as done is
    // only worth anything because done is what timeSaved counts.
    const status = readStatus('Hecho.');
    const measured = step({ status: status ?? 'pending', minutesBefore: 90, minutesAfter: 25 });
    assert.equal(timeSaved([measured]).perWeek, 65);
  });
});

/**
 * The number itself.
 *
 * Every recovered-hours figure in the product is a subtraction of two of these,
 * self-reported by the learner. A misread here does not fail: it produces a
 * plausible wrong number that gets shown to them as their own measurement.
 */
describe('reading minutes out of what the extractor wrote', () => {
  it('takes a plain number', () => {
    assert.equal(parseMinutes('90'), 90);
    assert.equal(parseMinutes('90 minutos'), 90);
    assert.equal(parseMinutes('~25'), 25);
    assert.equal(parseMinutes('25 min aprox'), 25);
  });

  it('does not concatenate the digits of a decimal', () => {
    // The bug this guards: stripping non-digits turned "45.5" into 455 and
    // "2,5" into 25. Both passed the range check. On minutes_before that is a
    // tenfold inflation of the saving, in the flattering direction.
    assert.equal(parseMinutes('45.5'), 46);
    assert.equal(parseMinutes('2,5'), 3);
  });

  it('takes the first number of a range rather than gluing them together', () => {
    assert.equal(parseMinutes('90-120'), 90);
  });

  it('understands hours, because that is how the answer gets said out loud', () => {
    assert.equal(parseMinutes('1 hora 30'), 90);
    assert.equal(parseMinutes('1h30'), 90);
    assert.equal(parseMinutes('una hora y media'), 90);
    assert.equal(parseMinutes('media hora'), 30);
    assert.equal(parseMinutes('2 horas'), 120);
  });

  it('keeps zero, which is a real answer', () => {
    // "Ya no lo hago" is the best possible outcome and must not read as missing.
    assert.equal(parseMinutes('0'), 0);
  });

  it('rejects what it cannot read instead of guessing', () => {
    assert.equal(parseMinutes('abc'), null);
    assert.equal(parseMinutes(''), null);
    assert.equal(parseMinutes(null), null);
    assert.equal(parseMinutes('3000'), null);
  });
});

/**
 * Whether the teacher recognises somebody it has already met.
 *
 * `learnerRecord` produces the three dynamic variables the agent starts with,
 * and `primera_sesion` is the one the persona branches its whole opening on.
 * Getting it wrong does not fail: it produces a perfectly pleasant conversation
 * in which a returning learner is greeted as a stranger and the commitment they
 * made last time is never mentioned. The product's entire claim is a teacher
 * that remembers you.
 */
describe('deciding whether this is the first session', () => {
  const summary = (over: Partial<SessionRecord> = {}): SessionRecord => ({
    id: 'h1',
    createdAt: new Date().toISOString(),
    lessonId: null,
    taught: 'Responder correos',
    commitment: null,
    commitmentDate: null,
    commitmentDone: null,
    ...over,
  });

  const recordFor = (input: {
    profile: CareerProfile | null;
    steps?: PlanStep[];
    history?: SessionRecord[];
  }) => buildRecord({ profile: input.profile, steps: input.steps ?? [], history: input.history ?? [] });

  it('a profile is not what makes it a first session', () => {
    /*
     * The bug this guards: the branch was `if (!profile)`. upsertProfile
     * deliberately writes nothing when a call taught it nothing about who the
     * person is, so a learner who talked about one task and never restated
     * their job has an empty career_profiles row and a full session_summaries
     * one. They were greeted as new every single time.
     */
    const record = recordFor({ profile: null, history: [summary({ commitment: 'mandar el resumen' })] });
    assert.equal(record.primera_sesion, 'no');
    assert.ok(record.registro.includes('mandar el resumen'), record.registro);
  });

  it('is a first session only when nothing has happened at all', () => {
    const record = recordFor({ profile: null, history: [] });
    assert.equal(record.primera_sesion, 'sí');
  });

  it('still says something useful when there is history but no profile', () => {
    const record = recordFor({ profile: null, history: [summary({ commitment: null })] });
    assert.equal(record.primera_sesion, 'no');
    assert.ok(record.registro.length > 0);
    assert.ok(!record.registro.includes('primera vez'), record.registro);
  });
});

/**
 * Whether a commitment is overdue.
 *
 * The date is extracted from the conversation and stored, and the notebook
 * showed only the text — so a deadline this product collected sat unused while
 * /coach displayed the same one. The commitment is what brings somebody back
 * between sessions; a notebook that knows a date has passed and says nothing is
 * a reminder declined.
 *
 * The comparison is on date strings on purpose. `commitment_date` is a plain
 * YYYY-MM-DD, and turning it into a timestamp makes "today" depend on the
 * server's timezone — which is how the same commitment reads as overdue in
 * Santiago and not in Madrid.
 */
describe('a commitment past its date', () => {
  const day = (offset: number) =>
    new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

  const session = (over: Partial<SessionRecord> = {}): SessionRecord => ({
    id: 'c1',
    createdAt: new Date().toISOString(),
    lessonId: null,
    taught: null,
    commitment: 'mandar el resumen',
    commitmentDate: null,
    commitmentDone: null,
    ...over,
  });

  it('is overdue once the day has passed and nobody has answered', () => {
    assert.equal(isOverdue(session({ commitmentDate: day(-1) })), true);
  });

  it('is not overdue on the day itself', () => {
    // The learner still has the day they asked for.
    assert.equal(isOverdue(session({ commitmentDate: day(0) })), false);
  });

  it('is not overdue before the day', () => {
    assert.equal(isOverdue(session({ commitmentDate: day(3) })), false);
  });

  it('stops being overdue once they answer, either way', () => {
    assert.equal(isOverdue(session({ commitmentDate: day(-5), commitmentDone: true })), false);
    assert.equal(isOverdue(session({ commitmentDate: day(-5), commitmentDone: false })), false);
  });

  it('is never overdue without a date', () => {
    // The spoken deadline is usually a phrase; only a real ISO date is stored.
    assert.equal(isOverdue(session({ commitmentDate: null })), false);
  });
});

/**
 * Every extracted field the teacher is meant to remember reaches the record.
 *
 * `agent.test.ts` proves each declared extraction is read back somewhere, and
 * that is a weaker claim than it sounds: `profile_ai_usage` satisfied it by
 * being mapped into an object, while no code path used the value. It was
 * extracted on every finished call, stored, and consumed by nobody — so the
 * persona asked "qué tiene a mano" in the first session and opened the second
 * without the answer, asking again.
 *
 * This checks the stronger thing: what the learner told the teacher about
 * themselves comes back the next time.
 */
describe('what the teacher carries between sessions', () => {
  const full: CareerProfile = {
    role: 'analista de operaciones',
    field: 'logística',
    sector: 'salud',
    experienceYears: 8,
    weeklyTasks: ['Responder correos de proveedores'],
    tools: ['Excel', 'Outlook'],
    aiUsage: 'usa ChatGPT para redactar, sin verificar',
    goal: 'dejar de perder la mañana en correos',
    chosenPath: 'mejorar',
    map: {},
    updatedAt: null,
  };

  const recordFor = (profile: CareerProfile) =>
    buildRecord({
      profile,
      steps: [],
      history: [
        {
          id: 'h1',
          createdAt: new Date().toISOString(),
          lessonId: null,
          taught: 'algo',
          commitment: null,
          commitmentDate: null,
          commitmentDone: null,
        },
      ],
    }).registro;

  for (const [label, value] of [
    ['the role', full.role!],
    ['what they are after', full.goal!],
    ['the tools they already have', full.tools[0]!],
    ['whether they already use AI', full.aiUsage!],
    ['their own weekly task', full.weeklyTasks[0]!],
  ] as const) {
    it(`carries ${label}`, () => {
      const said = recordFor(full);
      assert.ok(
        said.includes(value),
        `"${value}" never reaches the record, so the teacher asks for it again: ${said}`,
      );
    });
  }

  it('says the map was already given, which is why it is captured', () => {
    /*
     * Three extraction fields exist for this, under a comment reading "the map,
     * so it is never given twice", and the persona promises "una sola vez.
     * Después no se repite". Neither was enforceable while the record stayed
     * silent about it.
     */
    const said = recordFor({
      ...full,
      map: { value: 'dónde gana valor lo tuyo', categories: 'asistentes; datos', paths: 'mejorar' },
    });
    assert.ok(said.includes('Ya le diste el mapa'), said);
  });

  it('does not claim a map that was never given', () => {
    assert.ok(!recordFor({ ...full, map: {} }).includes('Ya le diste el mapa'));
  });

  it('says nothing about fields the learner never gave', () => {
    // Empty is not "unknown said out loud": a record padded with blanks spends
    // the budget that the plan and the commitment need.
    const said = recordFor({ ...full, aiUsage: null, goal: null, tools: [] });
    assert.ok(!said.includes('Con IA:'), said);
    assert.ok(!said.includes('Busca:'), said);
    assert.ok(!said.includes('Ya usa:'), said);
  });
});

/*
 * The class has to start even when the record cannot be read.
 *
 * `/api/signed-url` awaits `learnerRecord` to build the first sentence. A
 * rejection there used to fail the mint, so a learner who pressed the
 * microphone was told there was no class because three database reads did not
 * come back. Being met as a stranger is a bad session; being told the class
 * cannot start is no session, and nobody presses it twice.
 *
 * What this proves and what it does not: with no service key configured the
 * readers return empty rather than rejecting, so these run the cold path and pin
 * the contract — never throws, always three non-empty strings. They do not
 * exercise the catch or the deadline, which have no seam to inject a failure
 * through without restructuring the function around its own test. The contract
 * is the part that reaches a learner: an undefined here is spoken out loud as a
 * literal {{apertura}}.
 */
describe('learnerRecord when the database will not answer', () => {
  it('opens cold rather than throwing', async () => {
    const record = await learnerRecord('a-user-with-no-database-behind-it');
    assert.equal(record.primera_sesion, 'sí');
    assert.ok(record.apertura.length > 0, 'a first message is still spoken');
    assert.ok(record.registro.length > 0, 'the teacher still gets a record');
  });

  /*
   * The shape matters as much as the fact: these three are substituted into the
   * prompt and the first message before a word is spoken, so an undefined here
   * reaches a learner as a literal {{apertura}} said out loud.
   */
  it('returns every dynamic variable the agent expects', async () => {
    const record = await learnerRecord('another-user');
    for (const key of ['apertura', 'registro', 'primera_sesion'] as const) {
      assert.equal(typeof record[key], 'string', `${key} must be a string`);
      assert.notEqual(record[key], '', `${key} must not be empty`);
    }
  });
});

/*
 * Parsing the minutes a learner types.
 *
 * The form on /progreso exists because one extraction from speech was the only
 * way these arrived, and speech does not always cooperate: a real learner said
 * "un día" and the extractor correctly refused to turn that into minutes. The
 * parsing rule matters more than it looks, because these two numbers are the
 * whole offer and a wrong one is worse than a missing one — it goes into the
 * headline total for every task.
 *
 * `Number('')` is 0 is the specific trap: an empty field must clear the value,
 * never record that a task used to take no time at all.
 */
describe('minutes typed into the notebook', () => {
  // The same rule the action applies, kept beside it in intent: blank clears,
  // a plausible number sets, anything else is refused rather than coerced.
  const parse = (raw: string): number | null | undefined => {
    const t = raw.trim();
    if (t === '') return null;
    const value = Number(t);
    if (!Number.isFinite(value) || value < 0 || value > 60 * 24) return undefined;
    return Math.round(value);
  };

  it('clears on blank rather than recording zero', () => {
    assert.equal(parse(''), null);
    assert.equal(parse('   '), null);
  });

  it('takes a plain number', () => {
    assert.equal(parse('90'), 90);
    assert.equal(parse('25'), 25);
    assert.equal(parse('0'), 0, 'a task that now takes no time is a real answer');
  });

  it('refuses what it cannot trust instead of coercing it', () => {
    for (const bad of ['un día', 'abc', '-5', '99999', 'NaN', '1e400']) {
      assert.equal(parse(bad), undefined, `coerced ${JSON.stringify(bad)}`);
    }
  });

  it('rounds rather than storing a fraction of a minute', () => {
    assert.equal(parse('90.4'), 90);
    assert.equal(parse('90.6'), 91);
  });
});


/**
 * Positions, over every step the learner has rather than over the plan the last
 * conversation happened to describe.
 *
 * The bug this pins was silent by construction. `position` was the index into
 * `buildPlan`'s output, and `buildPlan` only sees the weekly tasks in the
 * profile — which `upsertProfile` replaces wholesale, so a lesson session that
 * mentions one task in passing shrinks it to one. Add a genuinely new lesson id
 * on top of that and the whole plan is renumbered from zero while the weekly
 * steps that dropped out of the profile keep positions from when the plan was
 * longer. Postgres has no unique index there to refuse it, so two steps sit on
 * one number and the order it returns them in is its own business.
 *
 * Nothing errors. The learner opens the notebook to a reshuffled plan, and "vas
 * en el paso 4" names a different lesson than it did yesterday.
 */
describe('the plan is numbered over every step that exists', () => {
  it('gives no two steps the same position', () => {
    // Five weekly tasks on the plan, of which the profile now remembers one.
    const carried = ['Correos', 'Informe', 'Reunión', 'Cotización', 'Resumen'];
    const existing = carried.map((task, i) =>
      step({ lessonId: weeklyLessonId(task), linkedTask: task, position: i + 1, title: task }),
    );

    const planned = buildPlan({
      weeklyTasks: ['Correos'],
      path: 'mejorar',
      carried: existing.map((s) => ({ lessonId: s.lessonId, done: true })),
    });

    const ordered = planOrder(existing, planned);
    const positions = ordered.map((_, i) => i);
    assert.equal(new Set(positions).size, ordered.length);

    // And every step that existed is still in the plan being written.
    for (const s of existing) {
      assert.ok(
        ordered.some((o) => o.lessonId === s.lessonId),
        `${s.lessonId} dropped out of the plan, and with it its minutes`,
      );
    }
  });

  it('keeps the levels in curriculum order', () => {
    const existing = [
      step({ lessonId: 'cri-01-contexto', level: 'criterio', position: 0 }),
      step({ lessonId: weeklyLessonId('Correos'), linkedTask: 'Correos', position: 1 }),
    ];
    const planned = buildPlan({
      weeklyTasks: ['Correos'],
      path: 'mejorar',
      carried: [{ lessonId: weeklyLessonId('Correos'), done: true }],
    });

    const ordered = planOrder(existing, planned);
    const rank = ordered.map((s) => LEVELS.findIndex((l) => l.id === s.level));
    assert.deepEqual(rank, [...rank].sort((a, b) => a - b), 'levels came back out of order');
  });

  it('lands a task taken on later after the ones already there', () => {
    const first = weeklyLessonId('Correos');
    const existing = [step({ lessonId: first, linkedTask: 'Correos', position: 1 })];
    const planned = buildPlan({
      weeklyTasks: ['Correos', 'Informe'],
      path: 'mejorar',
      carried: [{ lessonId: first, done: true }],
    });

    const ordered = planOrder(existing, planned);
    const weekly = ordered.filter((s) => s.linkedTask).map((s) => s.linkedTask);
    assert.deepEqual(weekly, ['Correos', 'Informe']);
  });

  it('takes the title from the curriculum when the lesson is still in it', () => {
    // A lesson renamed in curriculum.ts has to reach the rows; only steps
    // buildPlan no longer emits fall back to what is stored.
    const existing = [step({ lessonId: 'cri-01-contexto', level: 'criterio', title: 'Nombre viejo' })];
    const planned = buildPlan({ weeklyTasks: ['Correos'], path: 'mejorar' });

    const written = planOrder(existing, planned).find((s) => s.lessonId === 'cri-01-contexto');
    assert.notEqual(written?.title, 'Nombre viejo');
  });
});


/**
 * The session after the last one.
 *
 * Levels 2 to 4 are fixed lessons and finite, so every learner who keeps paying
 * arrives at a plan with every step done — and both things the teacher starts
 * from used to go blank there at once. The record stated that the steps were
 * done and gave no instruction; the opening said "retomemos donde quedamos"
 * about a plan with nowhere to resume. A subscription whose product has nothing
 * to do on the day the plan finishes is cancelled that week, and the measured
 * figure it is priced against had already stopped moving.
 *
 * A plan never built produces the same null current step and is the opposite
 * situation, so both are pinned here.
 */
describe('when every step of the plan is done', () => {
  const blank: CareerProfile = {
    role: 'contadora',
    field: null,
    sector: null,
    experienceYears: null,
    weeklyTasks: [],
    tools: [],
    aiUsage: null,
    goal: null,
    chosenPath: null,
    map: {},
    updatedAt: null,
  };

  const finished = [
    step({ lessonId: weeklyLessonId('Correos'), status: 'done' }),
    step({ lessonId: 'cri-01-contexto', level: 'criterio', status: 'done' }),
  ];

  it('the record tells the teacher what to do, not only what happened', () => {
    const record = buildRecord({ profile: blank, steps: finished, history: [] });
    assert.ok(
      /otra tarea de su semana/i.test(record.registro),
      `the record leaves the teacher to invent the session: ${record.registro}`,
    );
  });

  it('the opening asks for the next task rather than for a screen', () => {
    const said = opening(blank, null, null, 0, finished.length);
    assert.ok(/tarea de tu semana/i.test(said), said);
  });

  it('an unanswered commitment still wins the question', () => {
    // The follow-up is the one thing that outranks starting something new.
    const said = opening(
      blank,
      null,
      {
        id: 'h1',
        createdAt: new Date().toISOString(),
        lessonId: null,
        taught: null,
        commitment: 'mandar el resumen',
        commitmentDate: null,
        commitmentDone: null,
      },
      0,
      finished.length,
    );
    assert.ok(said.includes('¿Lo hiciste?'), said);
  });

  it('says nothing of the sort when the plan was never built', () => {
    const said = opening(blank, null, null, 0, 0);
    assert.ok(!/tarea de tu semana/i.test(said), said);
    const record = buildRecord({ profile: blank, steps: [], history: [] });
    assert.ok(!/otra tarea de su semana/i.test(record.registro), record.registro);
  });

});
