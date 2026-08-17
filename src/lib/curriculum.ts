/**
 * The curriculum: 4 levels, and the lessons inside them.
 *
 * This is the one source of truth for what gets taught. The persona receives a
 * compact rendering of it (`curriculumForPrompt`), the progress page renders the
 * full thing, and `buildPlan` turns it into the learner's own ordered steps at
 * the end of the diagnostic. Nothing about the syllabus is written in prose
 * anywhere else, because two copies of a syllabus drift and the visible one is
 * what people bought.
 *
 * ## Fixed and personalised lessons
 *
 * A fixed lesson is the same for everyone: what these systems do, how context
 * changes an answer, what never to paste into a chat. A personalised lesson is
 * taught on one of the learner's own weekly tasks, and the whole of level 2 is
 * that. The distinction is data (`personalised`) rather than a note in a
 * comment, because the teacher has to behave differently for the two: a fixed
 * lesson can be taught the same way twice, a personalised one cannot be taught
 * at all until the diagnostic has run.
 *
 * ## Why level 3 is a selection
 *
 * All 5 advanced lessons are written, and nobody gets all 5. Which ones apply
 * depends on the path the learner chose at the end of the map: someone staying
 * in their job needs chaining and automation, someone building something of
 * their own needs agents and construction. Teaching all of them would be a
 * course; teaching the subset is a plan.
 *
 * ## Proof
 *
 * Every lesson names an artifact. That is the product's definition of progress:
 * not "we covered it", but "you have a thing you can show". A lesson whose proof
 * is vague is a lesson that will be marked done without being done, so `proof`
 * is required on every entry and phrased as a noun the learner could name out
 * loud.
 */

/** The 4 levels, in the order they are taught. */
export type LevelId = 'fundamentos' | 'aplicado' | 'avanzado' | 'portafolio';

/**
 * The 3 application paths from the end of the map. The learner picks one, and it
 * decides the level 3 selection.
 */
export type PathId = 'mejorar' | 'moverse' | 'propio';

export interface Level {
  id: LevelId;
  /** Shown as "Nivel 1" and used for ordering. */
  number: 1 | 2 | 3 | 4;
  title: string;
  /** One line on what this level is for, in the learner's terms. */
  purpose: string;
}

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

export const LEVELS: readonly Level[] = [
  {
    id: 'fundamentos',
    number: 1,
    title: 'Fundamentos',
    purpose: 'Qué son estas herramientas, cómo se les habla y cómo se revisa lo que devuelven.',
  },
  {
    id: 'aplicado',
    number: 2,
    title: 'Aplicado',
    purpose: 'Tus propias tareas de la semana, una por una, hechas con un asistente.',
  },
  {
    id: 'avanzado',
    number: 3,
    title: 'Avanzado',
    purpose: 'De tarea suelta a flujo, y hasta donde llegue tu objetivo.',
  },
  {
    id: 'portafolio',
    number: 4,
    title: 'Portafolio',
    purpose: 'Juntar las pruebas y saber contarlas.',
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
 * Level 1. Fixed for everyone, and in this order for a reason: context before
 * prompting, verification before anything gets used at work, privacy before the
 * learner has built the habit of pasting real documents in.
 */
const FUNDAMENTOS: readonly Lesson[] = [
  {
    id: 'fun-01-que-hacen',
    level: 'fundamentos',
    title: 'Qué hacen y qué no hacen estos sistemas',
    objective:
      'Distinguir lo que un asistente hace bien de lo que no puede hacer, y entender por qué a veces inventa.',
    proof: 'Tu lista de 3 cosas que le vas a delegar y 3 que no.',
    personalised: false,
  },
  {
    id: 'fun-02-contexto',
    level: 'fundamentos',
    title: 'Contexto: la misma pregunta con y sin el tuyo',
    objective:
      'Reconocer por qué la misma pregunta da respuestas distintas y saber qué contexto entregar.',
    proof: 'La misma pregunta hecha 2 veces, con y sin contexto, y qué cambió.',
    personalised: false,
  },
  {
    id: 'fun-03-pedir-bien',
    level: 'fundamentos',
    title: 'Pedir bien: instrucción, contexto, formato',
    objective:
      'Armar una petición con instrucción, contexto, formato de salida y el razonamiento a la vista.',
    proof: 'Una petición tuya escrita con las 4 partes.',
    personalised: false,
  },
  {
    id: 'fun-04-verificar',
    level: 'fundamentos',
    title: 'Verificar antes de usar',
    objective:
      'Tener un hábito de revisión y saber qué revisar según el tipo de salida: texto, datos, código, resumen.',
    proof: 'Tu lista de comprobación de 4 puntos, escrita.',
    personalised: false,
  },
  {
    id: 'fun-05-privacidad',
    level: 'fundamentos',
    title: 'Privacidad y datos de tu trabajo',
    objective:
      'Saber qué no se pega nunca en un chat y qué preguntar en tu empresa antes de usar IA con datos reales.',
    proof: 'Tu regla escrita de qué datos sí y qué datos no, y a quién le preguntaste.',
    personalised: false,
  },
  {
    id: 'fun-06-panorama',
    level: 'fundamentos',
    title: 'El panorama de herramientas',
    objective:
      'Ubicar las categorías que existen (asistentes, IA dentro de tus herramientas, datos, automatización, agentes) y para qué sirve cada una.',
    proof: 'Tu mapa de qué categoría usarías para cada tarea de tu semana.',
    personalised: false,
  },
];

/**
 * Level 2 has no fixed lessons: it is one lesson per weekly task, so the entries
 * only exist once the diagnostic knows what the learner's week looks like.
 * `APPLIED` is the template `buildPlan` stamps out.
 */
const APPLIED = {
  level: 'aplicado' as const,
  title: (task: string) => `Tu tarea: ${task}`,
  objective: (task: string) =>
    `Hacer "${task}" con un asistente: qué abrir, qué escribir, qué revisar y dónde se equivoca.`,
  proof: (task: string) => `El resultado real de "${task}", hecho con IA, y qué corregiste a mano.`,
};

/** Between 3 and 5 weekly tasks become lessons. Fewer is a thin plan, more is a list nobody finishes. */
export const APPLIED_MIN = 3;
export const APPLIED_MAX = 5;

/**
 * Level 3. Fixed text, personalised selection: `paths` is what decides who gets
 * which. Chaining and automation serve anyone; agents and construction only
 * earn their place when the learner is going somewhere that needs them.
 */
const AVANZADO: readonly Lesson[] = [
  {
    id: 'avz-01-encadenar',
    level: 'avanzado',
    title: 'Encadenar: de tarea suelta a flujo repetible',
    objective:
      'Convertir una tarea que ya haces con IA en una secuencia repetible que produzca lo mismo cada semana.',
    proof: 'Tu flujo escrito en pasos, corrido 1 vez de principio a fin.',
    personalised: true,
    paths: ['mejorar', 'moverse', 'propio'],
  },
  {
    id: 'avz-02-automatizar',
    level: 'avanzado',
    title: 'Automatizar: cuándo deja de ser un chat',
    objective:
      'Reconocer cuándo un flujo conviene automatizar y con qué tipo de herramienta no-code hacerlo.',
    proof: 'Una automatización tuya funcionando, aunque sea de 2 pasos.',
    personalised: true,
    paths: ['mejorar', 'moverse', 'propio'],
  },
  {
    id: 'avz-03-agentes',
    level: 'avanzado',
    title: 'Agentes: qué son y cuándo se justifican',
    objective:
      'Entender qué hace un agente distinto de un asistente y qué podría hacer uno en tu campo.',
    proof: 'Tu descripción de un agente que te serviría, con lo que tendría permitido hacer y lo que no.',
    personalised: true,
    paths: ['moverse', 'propio'],
  },
  {
    id: 'avz-04-datos',
    level: 'avanzado',
    title: 'Datos: análisis sobre tus propias planillas',
    objective:
      'Usar IA sobre tus planillas y reportes reales, y saber cuándo el resultado no es confiable.',
    proof: 'Un análisis de tus datos, con la comprobación que hiciste para creerle.',
    personalised: true,
    paths: ['mejorar', 'moverse'],
  },
  {
    id: 'avz-05-construir',
    level: 'avanzado',
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
      'Juntar las pruebas de los niveles anteriores en algo que un empleador o un cliente pueda ver.',
    proof: 'El portafolio mismo: el resumen de lo que sabes hacer, con tus ejemplos.',
    personalised: true,
  },
  {
    id: 'por-02-contarlo',
    level: 'portafolio',
    title: 'Contarlo en 90 segundos',
    objective:
      'Poder decir en voz alta qué sabes hacer con IA, con ejemplos tuyos y sin exagerar.',
    proof: 'Tu relato de 90 segundos, ensayado por voz y corregido.',
    personalised: true,
  },
];

/** Every fixed lesson, in teaching order. Level 2 is absent by design. */
export const LESSONS: readonly Lesson[] = [...FUNDAMENTOS, ...AVANZADO, ...PORTAFOLIO];

export function lessonById(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}

export function lessonsForLevel(level: LevelId): readonly Lesson[] {
  return LESSONS.filter((l) => l.level === level);
}

/** The level 3 lessons that fit a chosen path. Unknown or unchosen path: all of them. */
export function advancedFor(path: PathId | null | undefined): readonly Lesson[] {
  if (!path || !(path in PATHS)) return AVANZADO;
  return AVANZADO.filter((l) => l.paths?.includes(path));
}

/** One step of a learner's own plan, before it is written to the database. */
export interface PlannedStep {
  lessonId: string;
  level: LevelId;
  title: string;
  /** The learner's own task, for level 2. Null for lessons that are the same for everyone. */
  linkedTask: string | null;
}

/**
 * The learner's plan: all of level 1, one level 2 lesson per weekly task, the
 * level 3 selection for their path, and level 4.
 *
 * Deterministic, and deliberately so. Nothing here asks a model to invent a
 * syllabus per person: the curriculum is fixed, the diagnostic supplies the
 * tasks and the path, and the plan is the join of the two. That is what makes
 * the plan the same on the progress page as it is in the teacher's mouth.
 *
 * `weeklyTasks` beyond `APPLIED_MAX` are dropped. A learner who lists 9 tasks
 * has described a job, not a plan, and the teacher is instructed to pick the 3
 * to 5 that fill most of the week.
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
    .slice(0, APPLIED_MAX);

  const applied: PlannedStep[] = tasks.map((task, i) => ({
    lessonId: `apl-${String(i + 1).padStart(2, '0')}`,
    level: APPLIED.level,
    title: APPLIED.title(task),
    linkedTask: task,
  }));

  return [
    ...FUNDAMENTOS.map(fixed),
    ...applied,
    ...advancedFor(input.path).map(fixed),
    ...PORTAFOLIO.map(fixed),
  ];
}

/** Objective and proof for a step, including the level 2 steps built per task. */
export function stepDetail(step: {
  lessonId: string;
  linkedTask: string | null;
}): { objective: string; proof: string } | null {
  const lesson = lessonById(step.lessonId);
  if (lesson) return { objective: lesson.objective, proof: lesson.proof };
  if (step.lessonId.startsWith('apl-') && step.linkedTask) {
    return {
      objective: APPLIED.objective(step.linkedTask),
      proof: APPLIED.proof(step.linkedTask),
    };
  }
  return null;
}

/**
 * The curriculum as the teacher receives it, in the system prompt.
 *
 * Titles only. The teacher does not need each objective spelled out to teach a
 * lesson it already understands, and every character here is paid for on every
 * turn. What it does need is the fixed order and the names, so that "vas en el
 * paso 4 de 11" refers to the same thing the learner can see on their progress
 * page.
 */
export function curriculumForPrompt(): string {
  const list = (lessons: readonly Lesson[]) =>
    lessons.map((l, i) => `${i + 1}. ${l.title}`).join('\n');

  return `Nivel 1, Fundamentos. Iguales para todos, en este orden:
${list(FUNDAMENTOS)}

Nivel 2, Aplicado. Una clase por cada tarea de su semana, entre 3 y 5. No existen antes del diagnóstico: las defines con las tareas que te dio.

Nivel 3, Avanzado. Eliges las que correspondan a su camino:
${AVANZADO.map((l) => `- ${l.title} (para: ${l.paths?.join(', ')})`).join('\n')}

Nivel 4, Portafolio:
${list(PORTAFOLIO)}

Los caminos son: mejorar (hacer mejor su trabajo actual), moverse (los roles que se están abriendo), propio (algo suyo).`;
}
