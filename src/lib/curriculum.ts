/**
 * The curriculum: 4 levels, and the lessons inside them.
 *
 * One source of truth. The persona receives a compact rendering
 * (`curriculumForPrompt`), the landing page renders it, the progress page
 * renders it, and `buildPlan` turns it into the learner's own ordered steps.
 *
 * ## Why level 1 is the learner's own work
 *
 * This used to open with six lessons of fundamentals and reach the learner's own
 * tasks at step 7 of 11. That order is defensible as teaching and indefensible as
 * a product: the first session ended with a plan, a plan is a promise of future
 * value, and nobody pays for a promise. Worse, the free tier ran out somewhere
 * around the diagnostic, so the only thing a trial could deliver was the promise.
 *
 * So the order is inverted. Level 1 is the task that weighs on the learner most,
 * done with them, in the session, ending in the real output and the time it will
 * save every week from now on. The fundamentals are level 2, taught as why the
 * thing that already worked worked — concrete before abstract, which is also the
 * better way to teach it.
 *
 * One fixed lesson stays at the front, and it is a safety ordering constraint
 * rather than a preference: a learner about to paste a real work document into a
 * chat needs the two minutes on what never goes in there *first*. Teaching that
 * after the fact would be irresponsible.
 *
 * ## Proof, and the number
 *
 * Every lesson names an artifact. Level 1 lessons additionally name two numbers:
 * how long the task took before, and how long it takes now. That subtraction is
 * the only honest claim this product can make about its own value, because it is
 * the learner's own measurement of their own task, and it is what makes the
 * monthly price an easy arithmetic problem rather than an act of faith.
 */

/** The 4 levels, in the order they are taught. */
export type LevelId = 'semana' | 'criterio' | 'flujo' | 'portafolio';

/**
 * The 3 application paths from the map. The learner picks one, and it decides
 * the level 3 selection.
 */
export type PathId = 'mejorar' | 'moverse' | 'propio';

export interface Lesson {
  id: string;
  level: LevelId;
  /** Spanish, said out loud as the name of the class. */
  title: string;
  /** One sentence: what the learner can do afterwards. */
  objective: string;
  /** The artifact that proves it. */
  proof: string;
  /**
   * True when the lesson is taught on the learner's own task and cannot be
   * taught before the diagnostic. False for lessons identical for everyone.
   */
  personalised: boolean;
  /**
   * Level 3 only: which chosen paths this lesson belongs to. Absent elsewhere,
   * where the level itself decides inclusion.
   */
  paths?: readonly PathId[];
}

export interface Level {
  id: LevelId;
  /** Shown as "Nivel 1" and used for ordering. */
  number: 1 | 2 | 3 | 4;
  title: string;
  /** One line on what this level is for, in the learner's terms. */
  purpose: string;
  /**
   * True when this level stamps out one lesson per weekly task. Explicit rather
   * than inferred from an empty lesson list: level 1 has both a fixed lesson and
   * per-task ones, and the difference decides what `buildPlan` emits.
   */
  perTask: boolean;
}

export const LEVELS: readonly Level[] = [
  {
    id: 'semana',
    number: 1,
    title: 'Tu semana',
    purpose:
      'La tarea que más te pesa, hecha contigo en la sesión, y el tiempo que te ahorra cada semana desde ahora.',
    perTask: true,
  },
  {
    id: 'criterio',
    number: 2,
    title: 'Por qué funcionó',
    purpose:
      'El criterio detrás de lo que ya hiciste, para que te sirva con cualquier herramienta y no solo con la de hoy.',
    perTask: false,
  },
  {
    id: 'flujo',
    number: 3,
    title: 'De tarea a flujo',
    purpose: 'Que lo que hiciste una vez se repita solo, y hasta donde llegue tu objetivo.',
    perTask: false,
  },
  {
    id: 'portafolio',
    number: 4,
    title: 'Portafolio',
    purpose: 'Juntar las pruebas y saber contarlas.',
    perTask: false,
  },
];

export const PATHS: Record<PathId, { title: string; body: string }> = {
  mejorar: {
    title: 'Hacer mejor tu trabajo actual',
    body: 'Hacer lo mismo más rápido y mejor, y ser quien le muestra al equipo cómo se hace.',
  },
  moverse: {
    title: 'Moverte a los roles que se están abriendo',
    body: 'Los cargos que piden conocimiento de tu campo más criterio para dirigir estas herramientas.',
  },
  propio: {
    title: 'Convertir tu experiencia en algo propio',
    body: 'Un servicio, una herramienta interna o un producto pequeño construido sobre lo que ya sabes.',
  },
};

/**
 * Level 1's fixed lesson: the guardrail before any real document is touched.
 *
 * Two minutes, not a class. It exists here rather than in level 2 because the
 * very next thing that happens is the learner pasting something from work into a
 * chat window, and the rule about what must never go in there is worth nothing
 * afterwards.
 */
const SEMANA: readonly Lesson[] = [
  {
    id: 'seg-01-privacidad',
    level: 'semana',
    title: 'Antes de pegar nada: qué no va nunca en un chat',
    objective:
      'Saber qué datos de tu trabajo no se pegan nunca y cómo trabajar con un documento real sin exponerlo.',
    proof: 'Tu regla escrita de qué sí y qué no, y cómo dejaste anónimo lo que usaste hoy.',
    personalised: false,
  },
];

/**
 * Level 1's per-task template. One lesson per weekly task, stamped out by
 * `buildPlan` once the diagnostic knows what the learner's week looks like.
 *
 * The objective is deliberately the finished output, not the technique. A learner
 * who finishes this step has the thing done and the number that says what it
 * saved; the technique is what level 2 names afterwards.
 */
const WEEKLY = {
  level: 'semana' as const,
  title: (task: string) => `${task}, resuelta`,
  objective: (task: string) =>
    `Terminar "${task}" con un asistente en esta sesión y medir cuánto tiempo te ahorra cada vez.`,
  proof: (task: string) =>
    `El resultado real de "${task}", más los minutos que tardabas antes y los que tardas ahora.`,
};

/** Between 3 and 5 weekly tasks become lessons. Fewer is a thin plan, more is a list nobody finishes. */
export const WEEKLY_MIN = 3;
export const WEEKLY_MAX = 5;

/**
 * Level 2. The durable half: why the thing that worked worked.
 *
 * Every objective is phrased against work the learner has already done, because
 * by the time they reach this level they have. "Por qué la misma pregunta te dio
 * dos respuestas distintas" is a question they have actually asked themselves.
 */
const CRITERIO: readonly Lesson[] = [
  {
    id: 'cri-01-contexto',
    level: 'criterio',
    title: 'Por qué el contexto cambió la respuesta',
    objective:
      'Reconocer qué parte de lo que escribiste hizo la diferencia, y poder repetirlo a propósito.',
    proof: 'La misma tarea hecha 2 veces, con y sin contexto, y qué cambió.',
    personalised: false,
  },
  {
    id: 'cri-02-pedir-bien',
    level: 'criterio',
    title: 'Pedir bien: instrucción, contexto, formato',
    objective:
      'Armar una petición con las 4 partes, en vez de escribir y corregir hasta que salga.',
    proof: 'Una petición tuya escrita con las 4 partes, guardada para reusar.',
    personalised: false,
  },
  {
    id: 'cri-03-verificar',
    level: 'criterio',
    title: 'Verificar sin volver a hacerlo todo',
    objective:
      'Tener un hábito de revisión por tipo de salida, para confiar en el resultado sin rehacerlo.',
    proof: 'Tu lista de comprobación de 4 puntos, escrita.',
    personalised: false,
  },
  {
    id: 'cri-04-limites',
    level: 'criterio',
    title: 'Qué no le vas a delegar, y por qué',
    objective:
      'Saber dónde estas herramientas fallan y por qué inventan, para no descubrirlo en algo que importa.',
    proof: 'Tu lista de 3 cosas que le delegas y 3 que no, con el motivo.',
    personalised: false,
  },
  {
    id: 'cri-05-panorama',
    level: 'criterio',
    title: 'El panorama, ya con criterio',
    objective:
      'Ubicar qué categorías existen y cuál te sirve para cada tarea, ahora que sabes cómo se siente usar una.',
    proof: 'Tu mapa de qué categoría usarías para cada tarea de tu semana.',
    personalised: false,
  },
];

/**
 * Level 3. Fixed text, personalised selection: `paths` decides who gets which.
 * Chaining and automation serve anyone; agents and construction only earn their
 * place when the learner is going somewhere that needs them.
 */
const FLUJO: readonly Lesson[] = [
  {
    id: 'flu-01-encadenar',
    level: 'flujo',
    title: 'Encadenar: de tarea suelta a flujo repetible',
    objective:
      'Convertir una tarea que ya haces con IA en una secuencia repetible que produzca lo mismo cada semana.',
    proof: 'Tu flujo escrito en pasos, corrido 1 vez de principio a fin.',
    personalised: true,
    paths: ['mejorar', 'moverse', 'propio'],
  },
  {
    id: 'flu-02-automatizar',
    level: 'flujo',
    title: 'Automatizar: cuándo deja de ser un chat',
    objective:
      'Reconocer cuándo un flujo conviene automatizar y con qué tipo de herramienta no-code hacerlo.',
    proof: 'Una automatización tuya funcionando, aunque sea de 2 pasos.',
    personalised: true,
    paths: ['mejorar', 'moverse', 'propio'],
  },
  {
    id: 'flu-03-agentes',
    level: 'flujo',
    title: 'Agentes: qué son y cuándo se justifican',
    objective:
      'Entender qué hace un agente distinto de un asistente y qué podría hacer uno en tu campo.',
    proof:
      'Tu descripción de un agente que te serviría, con lo que tendría permitido hacer y lo que no.',
    personalised: true,
    paths: ['moverse', 'propio'],
  },
  {
    id: 'flu-04-datos',
    level: 'flujo',
    title: 'Datos: análisis sobre tus propias planillas',
    objective:
      'Usar IA sobre tus planillas y reportes reales, y saber cuándo el resultado no es confiable.',
    proof: 'Un análisis de tus datos, con la comprobación que hiciste para creerle.',
    personalised: true,
    paths: ['mejorar', 'moverse'],
  },
  {
    id: 'flu-05-construir',
    level: 'flujo',
    title: 'Construir: cuándo vale la pena una herramienta propia',
    objective:
      'Saber cuándo tiene sentido construir algo tuyo, con no-code o con Claude Code, y qué construiría alguien en tu rol.',
    proof: 'Algo que construiste y que otra persona puede abrir y usar.',
    personalised: true,
    paths: ['propio'],
  },
];

/** Level 4. Both personalised: there is nothing to assemble but the learner's own proofs. */
const PORTAFOLIO: readonly Lesson[] = [
  {
    id: 'por-01-armar',
    level: 'portafolio',
    title: 'Armar el portafolio',
    objective:
      'Juntar las pruebas y los números de los niveles anteriores en algo que un jefe o un cliente pueda ver.',
    proof: 'El portafolio mismo: lo que sabes hacer, con tus ejemplos y las horas que ahorras.',
    personalised: true,
  },
  {
    id: 'por-02-contarlo',
    level: 'portafolio',
    title: 'Contarlo en 90 segundos',
    objective: 'Poder decir en voz alta qué sabes hacer con IA, con ejemplos tuyos y sin exagerar.',
    proof: 'Tu relato de 90 segundos, ensayado por voz y corregido.',
    personalised: true,
  },
];

/** Every fixed lesson, in teaching order. The per-task ones are absent by design. */
export const LESSONS: readonly Lesson[] = [...SEMANA, ...CRITERIO, ...FLUJO, ...PORTAFOLIO];

export function lessonById(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}

export function lessonsForLevel(level: LevelId): readonly Lesson[] {
  return LESSONS.filter((l) => l.level === level);
}

/** The level 3 lessons that fit a chosen path. Unknown or unchosen path: all of them. */
function advancedFor(path: PathId | null | undefined): readonly Lesson[] {
  if (!path || !(path in PATHS)) return FLUJO;
  return FLUJO.filter((l) => l.paths?.includes(path));
}

/** True when this step is one of the learner's own weekly tasks. */
export function isWeeklyTask(lessonId: string): boolean {
  return lessonId.startsWith('sem-');
}

/** One step of a learner's own plan, before it is written to the database. */
export interface PlannedStep {
  lessonId: string;
  level: LevelId;
  title: string;
  /** The learner's own task, for level 1. Null for lessons the same for everyone. */
  linkedTask: string | null;
}

/**
 * The learner's plan: the guardrail, one lesson per weekly task, the criterion
 * level, the level 3 selection for their path, and the portfolio.
 *
 * Deterministic, and deliberately so. Nothing here asks a model to invent a
 * syllabus per person: the curriculum is fixed, the diagnostic supplies the tasks
 * and the path, and the plan is the join of the two. That is what makes the plan
 * the same on the progress page as it is in the teacher's mouth.
 *
 * Tasks beyond `WEEKLY_MAX` are dropped. A learner who lists 9 tasks has
 * described a job, not a plan, and the teacher is instructed to pick the 3 to 5
 * that fill most of the week.
 */
export function buildPlan(input: {
  weeklyTasks: readonly string[];
  path: PathId | null | undefined;
}): PlannedStep[] {
  const fixed = (lesson: Lesson): PlannedStep => ({
    lessonId: lesson.id,
    level: lesson.level,
    title: lesson.title,
    linkedTask: null,
  });

  const tasks = input.weeklyTasks
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, WEEKLY_MAX);

  const weekly: PlannedStep[] = tasks.map((task, i) => ({
    lessonId: `sem-${String(i + 1).padStart(2, '0')}`,
    level: WEEKLY.level,
    title: WEEKLY.title(task),
    linkedTask: task,
  }));

  return [
    ...SEMANA.map(fixed),
    ...weekly,
    ...CRITERIO.map(fixed),
    ...advancedFor(input.path).map(fixed),
    ...PORTAFOLIO.map(fixed),
  ];
}

/** Objective and proof for a step, including the level 1 steps built per task. */
export function stepDetail(step: {
  lessonId: string;
  linkedTask: string | null;
}): { objective: string; proof: string } | null {
  const lesson = lessonById(step.lessonId);
  if (lesson) return { objective: lesson.objective, proof: lesson.proof };
  if (isWeeklyTask(step.lessonId) && step.linkedTask) {
    return {
      objective: WEEKLY.objective(step.linkedTask),
      proof: WEEKLY.proof(step.linkedTask),
    };
  }
  return null;
}

/**
 * The curriculum as the teacher receives it, in the system prompt.
 *
 * Titles only. Every character here is paid for on every turn, and the teacher
 * does not need each objective spelled out to teach a lesson it understands. What
 * it does need is the fixed order and the names, so that "vas en el paso 4 de 12"
 * refers to the same thing the learner can see on their progress page.
 */
export function curriculumForPrompt(): string {
  const list = (lessons: readonly Lesson[]) =>
    lessons.map((l, i) => `${i + 1}. ${l.title}`).join('\n');

  return `Nivel 1, Tu semana. Primero, una sola clase fija e igual para todos, antes de tocar cualquier documento real:
${list(SEMANA)}
Después, una clase por cada tarea de su semana, entre 3 y 5. No existen antes del diagnóstico: las defines con las tareas que te dio, y cada una termina con la tarea hecha y los minutos medidos.

Nivel 2, Por qué funcionó. Iguales para todos, en este orden:
${list(CRITERIO)}

Nivel 3, De tarea a flujo. Eliges las que correspondan a su camino:
${FLUJO.map((l) => `- ${l.title} (para: ${l.paths?.join(', ')})`).join('\n')}

Nivel 4, Portafolio:
${list(PORTAFOLIO)}

Los caminos son: mejorar (hacer mejor su trabajo actual), moverse (los roles que se están abriendo), propio (algo suyo).`;
}
