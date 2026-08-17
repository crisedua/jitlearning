/**
 * Everything on the public pages that is about the product rather than the code.
 *
 * ## The parity rule
 *
 * Every promise here is a behaviour the persona in `agent.ts` actually performs.
 * That is not a style preference: this product's whole claim is that it does not
 * make things up, and a marketing page that overstates it would be the first
 * thing to disprove the claim. Each entry's `key` is a `PromiseKey`, so a promise
 * cannot be added without a marker in the persona, and `scripts/doctor.ts` fails
 * when a marker is missing from the built prompt.
 *
 * The curriculum is not copied here either. The levels and lesson titles on the
 * landing page are rendered from `curriculum.ts`, which is the same object the
 * teacher works through and the progress page renders. People buy a syllabus
 * they can see, and they should be able to check that they got the one they saw.
 *
 * Copy rules: Spanish, lead with the reader's pain, digits for numbers, no
 * hashtags, no em dashes, no unverifiable statistics, active voice. Nothing here
 * is invented on the owner's behalf: an address made up to fill a layout reads as
 * real to every visitor who tries it.
 */
import type { PromiseKey } from './agent';

export interface Profile {
  email: string;
  /** Booking link. Leave empty and the link is not rendered. */
  bookingUrl: string;
  linkedin: string;
  website: string;
}

/** The value a field still has when nobody has filled it in. */
const TODO = '';

export const PROFILE: Profile = {
  email: 'eduardo@eduescalante.com',
  bookingUrl: TODO,
  linkedin: TODO,
  website: TODO,
};

/** WhatsApp, in the shape the wa.me link needs: digits only, no plus. */
export const WHATSAPP = {
  number: '56975387007',
  message: 'Hola, vengo de ModoJIT y tengo una consulta.',
};

/** True when there is at least one way to reach the owner. */
export const hasContact = Boolean(PROFILE.email || PROFILE.bookingUrl);

/** One line, used in metadata and as the tagline under the wordmark. */
export const TAGLINE = 'Profesor de IA por voz, en español, para tu trabajo.';

export const HERO = {
  title: 'Aprende a trabajar con IA antes de que trabajen sin ti.',
  sub: 'Un profesor por voz que te pregunta qué haces, te muestra qué es posible para alguien como tú, arma tu plan y te enseña paso a paso con tus propias tareas. En español. Cada sesión termina con algo que puedes mostrar.',
} as const;

/**
 * The 4 promises, each one a persona behaviour.
 *
 * `key` is typed as `PromiseKey`, so this list cannot claim anything the persona
 * has no marker for. That type error is the check firing at compile time; doctor
 * catches the other direction, where the marker exists but has fallen out of the
 * prompt text.
 */
export const PROMISES: readonly {
  key: PromiseKey;
  title: string;
  body: string;
}[] = [
  {
    key: 'map',
    title: 'Parte por ti.',
    body: 'Te entrevista sobre tu trabajo y te muestra el mapa: qué herramientas existen y qué te permiten hacer con lo que ya sabes.',
  },
  {
    key: 'plan',
    title: 'Plan visible.',
    body: 'Un currículum de 4 niveles, de fundamentos a portafolio, adaptado a tus tareas de cada semana. Lo ves completo en tu página de progreso.',
  },
  {
    key: 'memory',
    title: 'Se acuerda de ti.',
    body: 'Cada sesión parte por lo que te comprometiste la vez anterior, y no acepta un "sí, lo hice" sin que le cuentes qué salió.',
  },
  {
    key: 'honesty',
    title: 'No inventa.',
    body: 'Cuando responde desde una fuente la nombra, y cuando es criterio general te lo dice. Ninguna cifra sin fuente.',
  },
];

/** How the whole thing goes, for the "cómo funciona" band. */
export const STEPS = [
  {
    title: 'Te entrevista',
    body: 'La primera clase parte por ti: qué haces, en qué se te va la semana, qué herramientas usas y qué buscas. Una pregunta a la vez.',
  },
  {
    title: 'Te muestra el mapa',
    body: 'Qué es posible para alguien con tu experiencia: dónde gana valor lo que ya sabes, qué categorías de herramientas existen y 3 caminos para aplicarlo.',
  },
  {
    title: 'Arma tu plan',
    body: 'Los 4 niveles, con un paso por cada tarea de tu semana. Queda escrito en tu página de progreso y no lo pierdes de vista.',
  },
  {
    title: 'Te enseña, clase por clase',
    body: 'El concepto en 2 frases, los pasos exactos a ritmo de voz, cómo verificar lo que devuelve, y un ejercicio sobre tu propia tarea corregido ahí mismo.',
  },
  {
    title: 'Sales con 1 compromiso',
    body: '1 acción, 1 fecha y la señal que confirma que funcionó. La próxima clase empieza preguntándote por ella.',
  },
] as const;

/**
 * The comparison every visitor makes silently, answered out loud.
 *
 * Anyone landing here can already open a chat window, so "por qué no ChatGPT" is
 * the only real objection. Every row is checkable in one session, which is the
 * constraint that keeps this from being marketing: a difference nobody can
 * observe reads as a difference nobody has.
 */
export const DIFFERENCES = [
  {
    title: 'Te pregunta a ti',
    generic:
      'Responde lo que le preguntas. Si no sabes qué preguntar, la conversación no avanza.',
    teacher:
      'Empieza por entrevistarte y te enseña sobre tus tareas reales, no sobre un ejemplo.',
  },
  {
    title: 'Tiene un currículum',
    generic: 'Cada chat empieza de cero y termina donde lo dejaste.',
    teacher:
      '4 niveles en orden, de fundamentos a portafolio, y sabes en qué paso vas de cuántos.',
  },
  {
    title: 'Sabe qué te falta',
    generic: 'No recuerda la conversación de ayer.',
    teacher:
      'Abre por lo que te comprometiste y te pide que le cuentes qué construiste antes de seguir.',
  },
  {
    title: 'Distingue lo que sabe de lo que tiene',
    generic: 'Responde con la misma seguridad venga de donde venga, y a veces inventa la cita.',
    teacher:
      'Nombra la fuente cuando la tiene, te avisa cuando es criterio general, y no da cifras sin fuente.',
  },
] as const;
