/**
 * Everything on the public home page that is about *you* rather than about the
 * product. Kept in one file so it can be filled in or changed without touching
 * markup.
 *
 * Nothing here is invented on your behalf — a contact address made up to fill a
 * layout would read as real to every visitor who tried it.
 *
 * The contact section is hidden until at least one field is set, so the page is
 * publishable before this is complete. There is deliberately no biography here:
 * that section was removed for now and can come back when there is something
 * true to put in it.
 */

export interface Profile {
  email: string;
  /** Booking link — Calendly, Cal.com, TidyCal, whatever you use. */
  bookingUrl: string;
  /** Optional. Leave a value empty and the link is not rendered. */
  linkedin: string;
  website: string;
}

/** The value a field still has when nobody has filled it in. */
const TODO = '';

export const PROFILE: Profile = {
  email: TODO, // e.g. 'hola@tudominio.com'
  bookingUrl: TODO, // e.g. 'https://cal.com/tu-usuario/30min'
  linkedin: TODO,
  website: TODO,
};

/** True when there is at least one way to reach you. */
export const hasContact = Boolean(PROFILE.email || PROFILE.bookingUrl);

/**
 * What the coach does, in the learner's terms rather than the system's. Each
 * claim here is one the product actually keeps — the third is the one people
 * do not expect and the one worth leading with in conversation.
 */
export const CAPABILITIES = [
  {
    title: 'Responde a lo que te bloquea ahora',
    body: 'No es un curso ni un temario. Le cuentas en qué estás atascado y te da exactamente la parte que te desbloquea, sin empezar por los fundamentos que no pediste.',
    icon: 'bolt',
  },
  {
    title: 'Responde con fuentes, no de oídas',
    body: 'Se apoya en su base de conocimiento y te nombra la fuente mientras responde: de quién es la idea y de qué obra. Cuando no tiene material sobre algo, lo dice antes de responder en vez de improvisar con la misma seguridad.',
    icon: 'book',
  },
  {
    title: 'Te discute la decisión, no solo la duda',
    body: 'Va a lo que hay debajo de la pregunta: para qué es, qué depende de ello, qué pasa si sale mal. Cuando hay que elegir te dice cuál elegiría y qué tendría que cambiar para preferir la otra.',
    icon: 'screen',
  },
] as const;

/**
 * The comparison every visitor is making silently, answered out loud.
 *
 * Anyone landing here already pays for a general assistant, so "why not just
 * ChatGPT" is the only real objection. Left unanswered they answer it
 * themselves, and they answer it in favour of the tool they already have.
 *
 * Every row is a behaviour the persona in `src/lib/agent.ts` is explicitly
 * instructed to perform, and a visitor can check each one in a single session.
 * That constraint is the point: a difference that cannot be observed in one
 * conversation is marketing, and it will be read as marketing. If a claim is
 * removed from the persona, remove it here in the same change.
 *
 * `generic` describes the default behaviour of a capable assistant, not a
 * caricature of a bad one. Beating a strawman is not convincing to someone who
 * uses the real thing daily.
 */
export const DIFFERENCES = [
  {
    title: 'Te dice de dónde sale',
    generic:
      'Te da la idea sin procedencia. Puede ser algo que leyó en un libro concreto o algo que reconstruyó de memoria, y desde fuera suena exactamente igual.',
    coach:
      'Nombra la fuente en la misma frase: «esto es de Kagan, en Million Dollar Weekend». Puedes ir a comprobarlo, y puedes decidir cuánto te pesa esa voz.',
  },
  {
    title: 'No promedia a los autores',
    generic:
      'Resume varias fuentes hasta que suenan a consenso. El consejo templado que sale de ahí no es de nadie y no compromete a nada.',
    coach:
      'Kagan valida en 48 horas; Abdaal tardó años sin dejar su empleo. Te dice que se contradicen, de quién es cada postura, y cuál encaja con tu situación.',
  },
  {
    title: 'Cierra con un compromiso',
    generic:
      'Termina con una lista de opciones y un «espero que te sirva». La decisión, que era lo difícil, vuelve entera a tus manos.',
    coach:
      'Una sola cosa, con fecha, y qué señal contaría como que salió bien. La más barata que resuelva tu duda más grande, no la más completa.',
  },
  {
    title: 'Te avisa cuando no sabe',
    generic:
      'Responde con la misma seguridad esté fundamentado o improvisando. Nada en la respuesta te dice cuál de las dos acabas de recibir.',
    coach:
      'Si no tiene material tuyo sobre algo, lo dice antes de responder. Y responde igual: avisar no es negarse a ayudar.',
  },
] as const;

/** How a session actually goes, so nobody has to guess before clicking. */
export const STEPS = [
  {
    title: 'Abres el navegador y hablas',
    body: 'Nada que instalar. Le cuentas el problema como se lo contarías a un colega en el pasillo. Pide permiso del micrófono; si prefieres, escribe.',
  },
  {
    title: 'Pregunta lo único que cambia la respuesta',
    body: 'No un cuestionario: la única cosa que decide el consejo. Si ya puede darte algo útil con lo que le contaste, te lo da primero y pregunta después.',
  },
  {
    title: 'Busca en su base, no en internet',
    body: 'Recupera el fragmento que aplica a tu caso y te dice de qué fuente sale, con autor y obra. Si no tiene material sobre eso, lo dice antes de responder.',
  },
  {
    title: 'Sales con una cosa que hacer y una fecha',
    body: 'El paso más barato que resuelva tu duda más grande, con qué señal contaría como que salió bien. Y antes de cerrar te pide que lo apliques a tu caso, no que repitas una definición.',
  },
] as const;
