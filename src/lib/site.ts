/**
 * Everything on the public pages that is about the product rather than about
 * the code.
 *
 * ## The parity rule
 *
 * Every promise here is a behaviour the persona in `agent.ts` actually
 * performs. That is not a style preference: this product's whole claim is that
 * it does not make things up, and a marketing page that overstates it would be
 * the first thing to disprove the claim. `PROMISES` carries stable `key`s and
 * `scripts/doctor.ts` checks that the same three keys are asserted in the
 * persona, so removing a behaviour from one file and not the other fails the
 * check instead of shipping.
 *
 * Copy rules: Spanish, lead with the reader's pain, digits for numbers, no
 * hashtags, no em dashes, no unverifiable statistics, "apps" rather than
 * "productos". Nothing here is invented on the owner's behalf — an address
 * made up to fill a layout reads as real to every visitor who tries it.
 */

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

/**
 * WhatsApp, in the two shapes the wa.me link needs: digits only, no plus.
 */
export const WHATSAPP = {
  number: '56975387007',
  message: 'Hola, vengo de ModoJIT y tengo una consulta.',
};

/** True when there is at least one way to reach the owner. */
export const hasContact = Boolean(PROFILE.email || PROFILE.bookingUrl);

/** One line, used in metadata and as the tagline under the wordmark. */
export const TAGLINE = 'Coach de estudio por voz, en español, para PMP y empleabilidad con IA';

export const HERO = {
  title: 'Estudia por voz mientras caminas.',
  sub: 'ModoJIT te hace preguntas, escucha tu respuesta y te dice exactamente dónde fallaste y qué repasar. En español. Sin curso de 8 módulos.',
} as const;

/**
 * The two entry cards. `coach` matches the id in `coaches.ts`, so the card
 * links to a coach that exists rather than to a slug someone typed here.
 */
export const ENTRY_CARDS = [
  {
    coach: 'pmp',
    title: 'PMP',
    body: 'Preguntas situacionales al estilo PMI, corregidas al instante, con el dominio y la tarea del Exam Content Outline de cada una. Cuenta regresiva a tu fecha de examen.',
  },
  {
    coach: 'empleabilidad',
    title: 'Empleabilidad con IA',
    body: 'Te pregunta qué haces y qué sabes, te muestra qué herramientas de IA existen para alguien como tú y qué te permiten hacer con lo que ya sabes, arma tu plan y te enseña paso a paso con tus propias tareas: qué abrir, qué escribir, qué revisar. Cada sesión termina con algo que puedes mostrar. Para profesionales y para recién egresados.',
  },
] as const;

/**
 * The 3 promises, each one a persona behaviour.
 *
 * `key` is the contract with `doctor`. `personaMarker` is a phrase that must
 * appear in the built persona for the promise to be true, which is what makes
 * the check mechanical rather than a matter of reading both files carefully.
 */
export const PROMISES = [
  {
    key: 'honesty',
    title: 'No inventa.',
    body: 'Cuando responde desde una fuente la nombra, y cuando responde con criterio general te lo dice. Ninguna cifra sin fuente.',
    personaMarker: 'Nunca cifras sin fuente',
  },
  {
    key: 'memory',
    title: 'Se acuerda de ti.',
    body: 'Cada sesión parte por lo que fallaste la vez anterior.',
    personaMarker: 'Continuidad entre sesiones',
  },
  {
    key: 'commitment',
    title: 'Cierras con 1 compromiso.',
    body: '1 acción, 1 fecha, 1 señal de que funcionó.',
    personaMarker: 'Termina con un compromiso',
  },
] as const;

/** How a session goes, for the "cómo funciona" band. */
export const STEPS = [
  {
    title: 'Eliges el coach',
    body: 'PMP si rindes el examen. Empleabilidad si quieres saber qué aprender para tener más oportunidades.',
  },
  {
    title: 'Hablas 10 minutos',
    body: 'Se abre en el navegador y funciona con audífonos, caminando o manejando. Si prefieres escribir, también puedes.',
  },
  {
    title: 'Te corrige en el momento',
    body: 'No espera al final. Te dice si acertaste, por qué la mejor respuesta es la mejor y por qué la que elegiste no lo era.',
  },
  {
    title: 'Sales con 1 compromiso',
    body: '1 acción concreta, 1 fecha, y la señal que confirma que funcionó. La próxima sesión empieza preguntándote por él.',
  },
] as const;

/**
 * The comparison every visitor makes silently, answered out loud.
 *
 * Anyone landing here already pays for a general assistant, so "por qué no
 * ChatGPT" is the only real objection. Every row is checkable in one session,
 * which is the constraint that keeps this from being marketing: a difference
 * nobody can observe reads as a difference nobody has.
 */
export const DIFFERENCES = [
  {
    title: 'Te pregunta a ti',
    generic:
      'Responde lo que le preguntas. Si no sabes qué preguntar, la conversación no avanza.',
    coach:
      'Hace la pregunta y espera tu respuesta. Estudiar es responder, no leer respuestas.',
  },
  {
    title: 'Sabe dónde fallaste',
    generic: 'Empieza de cero en cada chat nuevo.',
    coach:
      'Abre la sesión por lo que fallaste la vez anterior y carga las preguntas hacia ahí.',
  },
  {
    title: 'Distingue lo que sabe de lo que tiene',
    generic:
      'Responde con la misma seguridad venga de donde venga, y a veces inventa la cita.',
    coach:
      'Nombra la fuente cuando la tiene y te avisa cuando está respondiendo con criterio general.',
  },
  {
    title: 'Te deja algo que hacer',
    generic: 'Termina cuando cierras la pestaña.',
    coach: 'Cierra con 1 acción, 1 fecha y 1 señal, y la próxima vez te pregunta por ella.',
  },
] as const;
