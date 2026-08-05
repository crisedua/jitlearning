/**
 * What the coach actually knows, for display on the learner-facing page.
 *
 * Hand-maintained on purpose. The obvious alternative — listing the knowledge
 * base straight from the API — does not work here for two reasons: the catalog
 * routes are behind `INGEST_SECRET` and this page is public, and the documents
 * are named after their files (`02-paso-2-validar-con-dinero.md`), which tells a
 * learner nothing about what they may ask.
 *
 * The cost of that choice is that this list can drift from the corpus. Drift in
 * one direction is uncomfortable but harmless: a topic in the base that nobody
 * knows to ask about. Drift in the other is the one to avoid — a topic listed
 * here with no material behind it, which the coach answers from general
 * knowledge. Update this file whenever documents are ingested or deleted.
 */
import type { CoachId } from './coaches';

/**
 * Who arrives with this problem. Now a grouping *within* a coach rather than a
 * filter across all of them — picking a coach already did most of the
 * separating a school director and a founder needed.
 */
export type Audience = 'empresa' | 'colegio' | 'ia' | 'negocio';

export interface Topic {
  title: string;
  /** One line on what the material covers. Written for a learner, not an index. */
  blurb: string;
  /** Real questions the corpus can answer. They double as tappable prompts. */
  examples: string[];
  audience: Audience;
  /**
   * Which coaches can actually answer this, which is a claim about their
   * attachment lists and not a display preference. Several, when the material
   * behind it is shared — `herramientas/` is attached to every coach, so the
   * topics it backs are listed on every coach's page.
   *
   * Listing a topic under a coach whose corpus does not contain it is the drift
   * that matters: the learner asks, the agent retrieves nothing, and answers
   * from general knowledge in the same confident voice.
   */
  coaches: CoachId[];
  /**
   * Recently added material. Marked so a returning learner can see what changed
   * without reading the whole list again — remove the flag once it stops being
   * news, which is a judgement call, not a date.
   */
  isNew?: boolean;
}

/** Group headings, in the order they are offered. */
export const AUDIENCE_LABELS: Record<Audience, string> = {
  empresa: 'Implementar en la empresa',
  colegio: 'Implementar en el colegio',
  ia: 'Herramientas de IA',
  negocio: 'Montar el negocio',
};

export const TOPICS: readonly Topic[] = [
  {
    title: 'Elegir entre asistentes de IA',
    blurb:
      'En qué se diferencian ChatGPT, Claude y Gemini, y cuál conviene según lo que tengas entre manos.',
    examples: [
      '¿Cuál me conviene para escribir documentos largos?',
      '¿En qué se diferencian Claude y ChatGPT?',
      'Pago por uno solo. ¿Cuál elijo?',
    ],
    audience: 'ia',
    // `herramientas/` is attached to every coach, so its topics appear on every
    // coach's page.
    coaches: ['estrategia', 'colegios', 'emprendedores'],
  },
  {
    title: 'Sacarle partido a un modelo',
    blurb:
      'Cómo darle contexto para que responda bien, y qué mecanismo conviene en cada caso: documentos de proyecto, instrucciones fijas o una skill.',
    examples: [
      'Le doy instrucciones y no hace lo que quiero',
      '¿Qué son las Skills y cuándo me conviene una?',
      '¿Subo el documento al proyecto o lo pego en el chat?',
    ],
    audience: 'ia',
    coaches: ['estrategia', 'colegios', 'emprendedores'],
  },
  {
    title: 'Liderar con IA',
    blurb: 'Cómo incorporar la IA al trabajo de un equipo sin quedarse en la demo.',
    examples: [
      '¿Por dónde empiezo a meter IA en mi equipo?',
      '¿Qué tareas conviene delegar a la IA y cuáles no?',
    ],
    audience: 'ia',
    coaches: ['estrategia'],
  },
  {
    title: 'Montar tu propio negocio',
    blurb:
      'Encontrar un dolor real, validarlo con dinero antes de construir, y hacer un producto mínimo. Noah Kagan, Dan Martell y Ali Abdaal.',
    examples: [
      'Tengo una idea, pero no sé si alguien pagaría por ella',
      '¿Cómo sé si mi idea resuelve un dolor de verdad?',
      '¿Qué construyo primero y qué dejo fuera?',
      '¿Cómo consigo mis tres primeros clientes?',
    ],
    audience: 'negocio',
    coaches: ['emprendedores'],
  },
  {
    title: 'Implementar IA en una empresa',
    blurb:
      'Por qué el 95% de los pilotos no muestra retorno (MIT, 2025) y qué hace distinto el 5%: caso de uso, gobernanza con NIST e ISO 42001, y medición con línea base.',
    examples: [
      '¿Por dónde parte una empresa con IA?',
      '¿Por qué fracasan casi todos los pilotos?',
      '¿Cómo mido si esto está dando retorno de verdad?',
      '¿Qué decisiones no debería automatizar nunca?',
    ],
    audience: 'empresa',
    coaches: ['estrategia'],
    isNew: true,
  },
  {
    title: 'Datos personales y Ley 21.719',
    blurb:
      'La ley chilena de protección de datos rige desde el 1 de diciembre de 2026 y aplica a cualquier organización que meta datos en una herramienta de IA. Qué obliga a tener y qué hacer este mes.',
    examples: [
      '¿Qué me obliga a hacer la Ley 21.719?',
      '¿Puedo subir datos de clientes a una herramienta de IA?',
      '¿Qué le tengo que preguntar al proveedor antes de firmar?',
    ],
    audience: 'empresa',
    // Only estrategia: the Ley 21.719 material lives in `empresa-ia/` and is
    // written for a company. A school's data questions are covered by its own
    // riesgos-privacidad document instead.
    coaches: ['estrategia'],
    isNew: true,
  },
  {
    title: 'Implementar IA en un colegio',
    blurb:
      'Cómo un establecimiento pasa de «algunos profesores la usan» a un uso institucional: por dónde partir, política de uso, formación docente y en qué ahorra tiempo de verdad. Con la guía del Mineduc, la de UNESCO y el toolkit de TeachAI.',
    examples: [
      '¿Por dónde parte un colegio con IA?',
      '¿Qué tiene que decir nuestra política de uso?',
      '¿Cuánto tiempo ahorran los profesores realmente?',
      '¿Cómo lo pruebo sin comprometer al colegio entero?',
    ],
    audience: 'colegio',
    coaches: ['colegios'],
    isNew: true,
  },
  {
    title: 'IA con estudiantes: enseñar y evaluar',
    blurb:
      'La evidencia va en dos direcciones: un tutor bien diseñado duplicó el aprendizaje en Harvard, y el acceso libre lo empeoró un 17% en un experimento con mil escolares. Qué distingue a uno del otro, y qué hacer con las evaluaciones.',
    examples: [
      '¿Dejamos que los estudiantes la usen o la prohibimos?',
      '¿Desde qué edad es razonable?',
      'Las tareas para la casa ya no miden nada. ¿Qué hago?',
      '¿Qué datos de estudiantes no pueden salir del colegio?',
    ],
    audience: 'colegio',
    coaches: ['colegios'],
    isNew: true,
  },
  {
    title: 'Productividad y energía para sostenerlo',
    blurb:
      'Qué hacer cuando no arrancas, cómo fijar objetivos que dependan de ti, y cómo recomprar tu tiempo.',
    examples: [
      'Sé lo que tengo que hacer y no arranco',
      '¿Qué tareas debería dejar de hacer yo?',
    ],
    audience: 'negocio',
    coaches: ['emprendedores'],
  },
];

/** This coach's topics, in catalog order. */
export function topicsFor(coach: CoachId): Topic[] {
  return TOPICS.filter((t) => t.coaches.includes(coach));
}

/*
 * The out-of-scope note moved to `Coach.outOfScopeNote` in `coaches.ts`: each
 * coach declines differently, and the useful version of that sentence names
 * which sibling coach to go to instead.
 */
