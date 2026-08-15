/**
 * What each coach can be asked, for display on the learner-facing page.
 *
 * Hand-maintained on purpose. Listing the knowledge base straight from the API
 * would not work here: the catalog routes are behind `INGEST_SECRET` and this
 * page is public, and documents are named after their files, which tells a
 * learner nothing about what they may ask.
 *
 * Since the corpus became a supplement rather than a boundary, drift here is
 * far less dangerous than it used to be: a topic listed without matching
 * material now gets answered from general knowledge under the honesty rule,
 * rather than producing a confident answer pretending to be sourced. These are
 * examples of what to ask, not a claim about what is in the knowledge base.
 */
import { findCoach, type CoachId } from './coaches';

/** Grouping within a coach's page. */
export type Audience = 'pmp' | 'empleabilidad';

export interface Topic {
  title: string;
  /** One line on what this covers. Written for a learner, not an index. */
  blurb: string;
  /** Real questions to ask. They double as tappable prompts. */
  examples: string[];
  audience: Audience;
  /** Which coaches can answer this. */
  coaches: CoachId[];
  isNew?: boolean;
}

/** Group headings, in the order they are offered. */
export const AUDIENCE_LABELS: Record<Audience, string> = {
  pmp: 'Examen PMP',
  empleabilidad: 'Carrera y empleabilidad',
};

export const TOPICS: readonly Topic[] = [
  {
    title: 'Preguntas situacionales al estilo PMI',
    blurb:
      'Un escenario, 4 opciones y la corrección al instante, con el dominio y la tarea del Examination Content Outline a los que pertenece cada pregunta.',
    examples: [
      'Hazme una pregunta de gestión de interesados',
      'Practiquemos preguntas de riesgo',
      'Dame una situación de cambio de alcance',
      '¿Por qué esa respuesta es mejor que la que elegí?',
    ],
    audience: 'pmp',
    coaches: ['pmp'],
  },
  {
    title: 'Cuando PMI y la práctica no coinciden',
    blurb:
      'Dónde el criterio del examen se aleja de lo que harías en tu trabajo real, que es donde más puntaje se pierde.',
    examples: [
      '¿Por qué PMI dice que no escale primero?',
      '¿Cómo sé si la pregunta es predictiva o ágil?',
      '¿Qué hago primero cuando cambia el alcance?',
    ],
    audience: 'pmp',
    coaches: ['pmp'],
  },
  {
    title: 'Los 3 dominios del examen',
    blurb:
      'Personas, Proceso y Entorno de negocio: qué entra en cada uno y en cuál estás más débil según tus sesiones anteriores.',
    examples: [
      '¿En qué dominio estoy fallando más?',
      '¿Qué cubre el dominio de Entorno de negocio?',
      'Repasemos control integrado de cambios',
    ],
    audience: 'pmp',
    coaches: ['pmp'],
  },

  {
    title: 'Tu mapa: qué abre la IA para alguien como tú',
    blurb:
      'Dónde gana valor lo que ya sabes, qué tipos de herramientas existen y qué te desbloquea cada una, y 3 caminos para aplicarlo según tu objetivo.',
    examples: [
      '¿Qué herramientas de IA me sirven en lo que hago?',
      '¿Qué de lo que sé vale más ahora?',
      '¿Qué tareas mías se están automatizando?',
      'Estoy sin trabajo. ¿Por dónde parto?',
    ],
    audience: 'empleabilidad',
    coaches: ['empleabilidad'],
    isNew: true,
  },
  {
    title: 'Tu plan, paso a paso y con tus propias tareas',
    blurb:
      'Cada clase se ancla a una tarea real de tu semana: qué abrir, qué escribir, qué revisar antes de usar el resultado, y un ejercicio dentro de la sesión.',
    examples: [
      'Enséñame a hacer esta tarea con un asistente',
      '¿Cómo verifico lo que me devuelve?',
      '¿Cuándo conviene una automatización y cuándo un agente?',
      'No alcancé a hacer la tarea. ¿La achicamos?',
    ],
    audience: 'empleabilidad',
    coaches: ['empleabilidad'],
    isNew: true,
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
    audience: 'empleabilidad',
    coaches: ['empleabilidad'],
    isNew: true,
  },
];

/** This coach's topics, its own subject first. */
export function topicsFor(coach: CoachId): Topic[] {
  const audiences = findCoach(coach)?.audiences ?? [];
  const rank = (t: Topic) => {
    const i = audiences.indexOf(t.audience);
    return i === -1 ? audiences.length : i;
  };
  return TOPICS.filter((t) => t.coaches.includes(coach)).sort((a, b) => rank(a) - rank(b));
}
