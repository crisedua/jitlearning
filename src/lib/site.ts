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
  title: 'La primera clase termina con una tarea de tu trabajo ya hecha.',
  sub: 'Un profesor de IA por voz, en español. Te pregunta qué haces, elige la tarea que más te pesa y la resuelven juntos en la sesión, hoy. Al final mides cuánto tardabas antes y cuánto tardas ahora: ese número es tuyo y se repite cada semana.',
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
    key: 'resolver',
    title: 'Empiezas resolviendo, no escuchando.',
    body: 'La primera sesión no es teoría ni un diagnóstico largo: es tu tarea más pesada, hecha contigo, con tus datos, hoy.',
  },
  {
    key: 'medir',
    title: 'Mides lo que ahorras.',
    body: 'Cada tarea de tu semana queda con dos números tuyos: lo que tardabas y lo que tardas ahora. La suma está en tu página de progreso y puedes revisarla tarea por tarea.',
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
    title: '4 preguntas, no un cuestionario',
    body: 'Qué haces, en qué se te va la semana, cuál de esas tareas te pesa más, y qué tienes a mano. Nada más: lo demás se pregunta después.',
  },
  {
    title: '2 minutos de privacidad',
    body: 'Qué no se pega nunca en un chat y cómo dejar anónimo lo que vas a usar. Antes de tocar un documento de tu trabajo, no después.',
  },
  {
    title: 'Hacen la tarea, ahora',
    body: 'Tú ejecutas y te va guiando: qué abrir, qué escribir, qué revisar. Un paso a la vez. Si vas caminando, la dictan y la terminas después.',
  },
  {
    title: 'Mides los dos números',
    body: 'Cuánto tardabas y cuánto tardaste. La resta es lo que recuperas cada semana, y queda anotada en tu página de progreso.',
  },
  {
    title: 'Recién ahí, tu plan',
    body: 'El mapa de qué más es posible y las clases que siguen, una por cada tarea tuya. Cuesta menos creerlo cuando ya viste funcionar algo tuyo.',
  },
] as const;

/**
 * The feedback deal, in one place because it was in three.
 *
 * It offered "3 meses del plan Esencial" on the page, in the metadata and in the
 * form's success message, and `esencial` had been unpublished in a migration two
 * passes earlier. Nobody noticed, because a plan name is exactly the kind of
 * detail that reads as fine until somebody tries to claim it.
 *
 * `planId` must name a row that `is_public` in the `plans` table, and
 * `site.test.ts` checks it against the plan list so the same thing cannot happen
 * again quietly.
 *
 * ## It used to say "grant it by hand"
 *
 * On the grounds that this is a promise made by a person, not a coupon the code
 * redeems. That is still true and `/admin/feedback` keeps it true: nothing is
 * granted when feedback arrives, somebody reads it and decides.
 *
 * What by hand actually meant was writing an UPDATE, remembering how many of the
 * ten seats were gone, and remembering to take the plan away in three months.
 * The first is tedious and the other two are the promise itself. Nothing recorded
 * that a plan was given rather than bought, so every grant would have become
 * permanent and the seat count on a public page would have been a guess. The
 * judgement stays with the person; the bookkeeping does not.
 */
export const FEEDBACK_REWARD = {
  months: 3,
  plan: 'Fundador',
  planId: 'founder',
  seats: 10,
} as const;

export const FEEDBACK_DEAL = `El trato: lo pruebas, dejas tu feedback en esta página, lo bueno y lo malo sin filtro, y te activo ${FEEDBACK_REWARD.months} meses gratis del plan ${FEEDBACK_REWARD.plan}. Solo para las primeras ${FEEDBACK_REWARD.seats} personas.`;

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
    title: 'Terminas con trabajo hecho',
    generic:
      'Responde lo que le preguntas. Si no sabes qué preguntar, la conversación no avanza y no queda nada hecho.',
    teacher:
      'La primera sesión termina con una tarea real de tu semana resuelta y el tiempo que ahorras medido.',
  },
  {
    title: 'Tiene un currículum',
    generic: 'Cada chat empieza de cero y termina donde lo dejaste.',
    teacher:
      '4 niveles en orden, y el primero son tus propias tareas. Sabes en qué paso vas de cuántos.',
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
