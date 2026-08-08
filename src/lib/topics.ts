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

export interface Topic {
  title: string;
  /** One line on what the material covers. Written for a learner, not an index. */
  blurb: string;
  /** Real questions the corpus can answer. They double as tappable prompts. */
  examples: string[];
}

export const TOPICS: readonly Topic[] = [
  {
    title: 'Elegir entre Claude, ChatGPT y Gemini',
    blurb:
      'Qué es cada asistente, sus ventajas y desventajas, y cuál conviene para cada tarea, equipo y presupuesto.',
    examples: [
      '¿Cuál me conviene para escribir documentos largos?',
      '¿En qué se diferencian Claude y ChatGPT?',
      '¿Cuándo tiene sentido elegir Gemini?',
      'Mi equipo vive en Google Workspace, ¿qué asistente nos conviene?',
    ],
  },
  {
    title: 'Liderar con IA',
    blurb: 'Cómo incorporar la IA al trabajo de un equipo sin quedarse en la demo.',
    examples: [
      '¿Por dónde empiezo a meter IA en mi equipo?',
      '¿Qué tareas conviene delegar a la IA y cuáles no?',
    ],
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
  },
  {
    title: 'Productividad y energía para sostenerlo',
    blurb:
      'Qué hacer cuando no arrancas, cómo fijar objetivos que dependan de ti, y cómo recomprar tu tiempo.',
    examples: [
      'Sé lo que tengo que hacer y no arranco',
      '¿Qué tareas debería dejar de hacer yo?',
    ],
  },
];

/**
 * Shown under the list. The coach announces out loud when it is answering
 * without material, but that notice arrives after the question — saying it here
 * sets the expectation before someone spends a turn on it.
 */
export const OUT_OF_SCOPE_NOTE =
  'Fuera de estos temas el coach te avisará de que no tiene material tuyo y responderá de conocimiento general.';
