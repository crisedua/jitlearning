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

export const TOPICS: readonly Topic[] = [
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
    title: 'La clase de hoy, con tus propias tareas',
    blurb:
      'Cada clase se ancla a una tarea real de tu semana: qué abrir, qué escribir, qué revisar antes de usar el resultado, y un ejercicio dentro de la sesión.',
    examples: [
      'Enséñame a hacer esta tarea con un asistente',
      '¿Cómo verifico lo que me devuelve?',
      'Hagamos el ejercicio ahora, estoy frente al computador',
      'No alcancé a hacer la tarea. ¿La achicamos?',
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
