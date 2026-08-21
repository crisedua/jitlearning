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
import { LEVELS } from './curriculum';

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

/**
 * The promise moved from productivity to career.
 *
 * It used to lead with the saving: a task done today and a number that repeats
 * every week. True, checkable, and the wrong headline for who is reading. The
 * person landing here is not shopping for a faster Tuesday, they are worried
 * about being left behind at work, and "recuperas setenta minutos" answers a
 * question they did not ask.
 *
 * So the saving drops from headline to evidence. It is still measured, still
 * theirs, still on the progress page, and it is now the proof under a claim
 * about capability rather than the claim itself.
 */
export const HERO = {
  title: 'Tu trabajo ya exige IA. A ti nadie te enseñó a usarla.',
  sub: 'Un profesor de IA por voz, en español. En cada clase resuelves una tarea real de tu trabajo usando IA, y sales sabiendo hacerla tú. Al final del currículum no tienes un certificado: tienes un portafolio de trabajo hecho con IA que puedes mostrar.',
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
    body: 'Tu primera sesión es tu tarea más pesada, hecha contigo, con tus datos, hoy.',
  },
  {
    key: 'medir',
    /*
     * Same behaviour, demoted. The teacher still asks for both numbers and
     * still says the subtraction out loud, which is what the `medir` marker
     * guarantees. What changed is what the number is *for*: it used to be the
     * product's headline claim and it is now the evidence under a capability
     * the learner can name.
     */
    title: 'Queda registrado lo que sabes hacer.',
    body: 'Cada tarea que resuelves queda en tu página de progreso con lo que construiste y tus 2 números: lo que tardabas y lo que tardas ahora.',
  },
  {
    key: 'memory',
    title: 'Se acuerda de ti.',
    body: 'Cada sesión parte por lo que te comprometiste la vez anterior, y te pide contarle qué salió.',
  },
  {
    key: 'honesty',
    title: 'No inventa.',
    body: 'Nombra la fuente cuando la tiene, avisa cuando es criterio general. Ninguna cifra sin fuente.',
  },
];

/**
 * How the whole thing goes, for the "cómo funciona" band.
 *
 * One sentence per body. Each row renders next to an animated vignette in
 * `AnimatedSteps` that shows the stage, so the prose only has to say what the
 * picture cannot.
 */
export const STEPS = [
  {
    title: '4 preguntas, no un cuestionario',
    body: 'Qué haces, en qué se te va la semana, qué tarea te pesa más, y qué tienes a mano.',
  },
  {
    title: '2 minutos de privacidad',
    body: 'Qué no se pega nunca en un chat, antes de tocar un documento de tu trabajo.',
  },
  {
    title: 'Hacen la tarea, ahora',
    body: 'Tú ejecutas y te va guiando: qué abrir, qué escribir, qué revisar. Si vas caminando, la dictan.',
  },
  {
    title: 'Mides los 2 números',
    body: 'Cuánto tardabas y cuánto tardaste. La tarea queda anotada con esa resta al lado, como prueba de que ya sabes resolverla.',
  },
  {
    title: 'Recién ahí, tu plan',
    body: 'El mapa de qué más es posible, con una clase por cada tarea tuya.',
  },
] as const;

/**
 * The curriculum band's own heading, which used to be typed into `page.tsx`.
 *
 * It lives here for the same reason the rest of this file does: it is a claim
 * about the product, and claims belong where the parity rule can see them. The
 * count itself is still read from `LEVELS.length` at the call site, so retiring
 * a level cannot leave a stale "4" on the page.
 */
export const CURRICULUM_BAND = {
  title: 'del primer prompt a un portafolio que te respalda.',
  body: 'No estudias IA en abstracto. Cada nivel trabaja sobre tareas reales de tu pega, y lo que aprendes queda registrado en tu página de progreso: qué sabes hacer con IA, en qué tareas, y cuánto tiempo te devuelve cada una.',
} as const;

/**
 * The closing argument, said once, immediately before the last button.
 *
 * The page did not have one: it went from the how-it-works band straight to
 * "¿Hacemos la primera clase?", which asks for the click without ever saying
 * what the thing is for. This is where the new promise gets stated plainly
 * instead of implied.
 *
 * Every sentence here is checkable against a behaviour. No videos and no tests
 * is a statement about what this product does not contain. Resolving your own
 * work class by class is the session spine in `agent.ts`. "Anota lo que ya sabes
 * hacer" is the progress page, written by the post-call extraction. The three
 * things the record holds are the three things `/progreso` renders.
 */
export const CLOSING = {
  title: 'El que sabe usar IA no es el que hizo un curso. Es el que la usa en su trabajo y puede probarlo.',
  body: 'Por eso ModoJIT no te muestra videos ni te toma pruebas. Te pone a resolver tu propio trabajo con IA, clase por clase, y anota lo que ya sabes hacer. Tu página de progreso es tu registro: capacidades, tareas y tiempo recuperado, con tus propios números.',
  cta: 'Empezar la primera clase',
} as const;

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
    generic: 'Responde lo que le preguntas, y no queda nada hecho.',
    teacher: 'La sesión termina con una tarea tuya resuelta, anotada en tu registro y medida.',
  },
  {
    title: 'Tiene un currículum',
    generic: 'Cada chat empieza de cero.',
    teacher: `${LEVELS.length} niveles en orden, y el primero son tus propias tareas.`,
  },
  {
    title: 'Sabe qué te falta',
    generic: 'No recuerda la conversación de ayer.',
    teacher: 'Abre por tu compromiso anterior y te pregunta qué salió.',
  },
  {
    title: 'Distingue lo que sabe de lo que tiene',
    generic: 'Responde igual de seguro venga de donde venga.',
    teacher: 'Nombra fuentes, avisa el criterio general, ninguna cifra sin fuente.',
  },
] as const;
