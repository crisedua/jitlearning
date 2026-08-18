/**
 * What the teacher can be asked, for display on the session page.
 *
 * Hand-maintained on purpose. Listing the knowledge base straight from the API
 * would not work here: the catalog routes are behind `INGEST_SECRET` and this
 * page is behind a learner session, and documents are named after their files,
 * which tells nobody what they may ask.
 *
 * Since the corpus became a supplement rather than a boundary, drift here is not
 * dangerous the way it was: a topic listed without matching material is answered
 * from general knowledge under the honesty rule. These are examples of what to
 * say out loud, not a claim about what is in the knowledge base.
 */

export interface Topic {
  title: string;
  /** One line on what this covers. Written for a learner, not an index. */
  blurb: string;
  /** Real things to say. They double as tappable prompts. */
  examples: string[];
}

/**
 * Order is the suggestion, and the first suggestion decides a first session.
 *
 * `CoachExplorer` flattens this list in order and every example becomes a button
 * that *starts the session on that question*. The map used to lead, so the first
 * four things a first-time learner could tap were all "tell me what is
 * possible" — and the persona is written to follow whatever they bring, which
 * means a first session spent on the map.
 *
 * That is the mistake this product already made once and reordered to fix. The
 * README's own account of it: opening with fundamentals meant a first session
 * ended with a plan rather than with something done, which is a vitamin. A map
 * is a better vitamin and still a vitamin, and a first session that ends without
 * a finished task produces no second number, so no measured saving, so no offer.
 *
 * The task leads now, and its first example is the painkiller stated plainly.
 * The map stays exactly as it was, one row down, for the session where it is the
 * right thing to ask for.
 */
export const TOPICS: readonly Topic[] = [
  {
    title: 'La clase de hoy, con tus propias tareas',
    blurb:
      'Cada clase se ancla a una tarea real de tu semana: qué abrir, qué escribir, qué revisar antes de usar el resultado, y un ejercicio dentro de la sesión.',
    examples: [
      'Tengo una tarea que me quita horas cada semana. Hagámosla ahora',
      'Enséñame a hacer esta tarea con un asistente',
      '¿Cómo verifico lo que me devuelve?',
      'No alcancé a hacer la tarea. ¿La achicamos?',
    ],
  },
  {
    title: 'Tu mapa: qué abre la IA para alguien como tú',
    blurb:
      'Dónde gana valor lo que ya sabes, qué categorías de herramientas existen y qué te desbloquea cada una, y 3 caminos para aplicarlo.',
    examples: [
      'Cuéntame qué es posible para alguien que hace lo que yo hago',
      '¿Qué de lo que sé vale más ahora?',
      '¿Qué tareas mías se están automatizando?',
      'Estoy sin trabajo. ¿Por dónde parto?',
    ],
  },
  {
    title: 'Qué herramientas existen para lo tuyo',
    blurb:
      'Pregunta por una tarea concreta y la respuesta va atada a tu perfil, no a una lista genérica.',
    examples: [
      '¿Qué herramientas existen para revisar contratos?',
      '¿Cuándo conviene una automatización y cuándo un agente?',
      '¿Qué datos de mi trabajo no debería pegar en un chat?',
      '¿Vale la pena que construya algo yo?',
    ],
  },
  {
    title: 'Recién egresado o todavía estudiando',
    blurb:
      'Qué pide hoy un empleador de tu campo a alguien que recién entra, y qué deberías poder mostrar que sabes hacer con IA.',
    examples: [
      'Salí de la carrera y no sé qué piden',
      '¿Qué debería saber hacer para mi primer trabajo?',
      '¿Cómo demuestro lo que aprendí sin experiencia?',
    ],
  },
];
