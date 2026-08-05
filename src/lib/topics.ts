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

/**
 * Who arrives with this problem. Drives the filter on the coach page: a school
 * director and someone starting a business share almost nothing, and showing
 * each of them the other's questions makes the coach look unfocused.
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
   * Recently added material. Marked so a returning learner can see what changed
   * without reading the whole list again — remove the flag once it stops being
   * news, which is a judgement call, not a date.
   */
  isNew?: boolean;
}

/** Filter labels, in the order they are offered. */
export const AUDIENCES: readonly { id: Audience; label: string }[] = [
  { id: 'empresa', label: 'Una empresa' },
  { id: 'colegio', label: 'Un colegio' },
  { id: 'ia', label: 'Herramientas de IA' },
  { id: 'negocio', label: 'Mi propio negocio' },
];

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
  },
  {
    title: 'Liderar con IA',
    blurb: 'Cómo incorporar la IA al trabajo de un equipo sin quedarse en la demo.',
    examples: [
      '¿Por dónde empiezo a meter IA en mi equipo?',
      '¿Qué tareas conviene delegar a la IA y cuáles no?',
    ],
    audience: 'ia',
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
  },
];

/**
 * Shown under the list. The coach declines out loud when a question falls
 * outside its scope, but that notice arrives after the question — saying it
 * here sets the expectation before someone spends a turn on it.
 */
export const OUT_OF_SCOPE_NOTE =
  'Fuera de estos temas el coach te lo dirá y no responderá: para eso es mejor un asistente general. Dentro de ellos, si no tiene material sobre algo, te avisará antes de responder.';
