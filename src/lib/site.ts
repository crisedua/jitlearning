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
  email: 'eduardo@eduescalante.com',
  bookingUrl: TODO, // e.g. 'https://cal.com/tu-usuario/30min'
  linkedin: TODO,
  website: TODO,
};

/**
 * WhatsApp, in the two shapes the wa.me link needs: digits only, no plus.
 * Rendered as the floating button on every page.
 */
export const WHATSAPP = {
  number: '56975387007',
  /** Pre-filled first message, so the chat opens with context instead of blank. */
  message: 'Hola, vengo de ModoJIT y tengo una consulta.',
};

/** True when there is at least one way to reach you. */
export const hasContact = Boolean(PROFILE.email || PROFILE.bookingUrl);

/**
 * What the coaches do, in the learner's terms rather than the system's. Each
 * claim here is one the product actually keeps — the third is the one people
 * do not expect and the one worth leading with in conversation.
 *
 * These describe the *shared* behaviour, which is why they can be said once for
 * all of them: every coach is built from the same core persona in
 * `src/lib/agent.ts` and differs only in its material. Anything that is true of
 * one coach and not another belongs on that coach's entry in `coaches.ts`, not
 * here.
 */
export const CAPABILITIES = [
  {
    title: 'Para la decisión que tienes encima',
    body: 'Eliges el coach según lo que tengas entre manos: implementar IA en tu empresa, en tu colegio, o montar tu propio negocio. Cada uno responde solo de lo suyo, con el material de lo suyo.',
    icon: 'bolt',
  },
  {
    title: 'Con la fuente, la fecha y dónde verificarla',
    body: 'Te nombra el documento y de cuándo es mientras responde: la guía del Mineduc de marzo de 2025, la Ley 21.719 que rige desde diciembre de 2026. Si no tiene la referencia exacta, te dice dónde se comprueba en vez de inventar un enlace.',
    icon: 'book',
  },
  {
    title: 'Cierra con una cosa y una fecha',
    body: 'Va a la decisión debajo de la pregunta y termina con el paso más barato que resuelve tu duda más grande, con plazo y con qué señal contaría como que salió bien. No un menú de opciones.',
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
    title: 'Sabe de cuándo es lo que sabe',
    generic:
      'No tiene fecha. Responde con la misma seguridad sobre una norma vigente y sobre una que cambió el año pasado, y no puede decirte cuándo aprendió lo que te está diciendo.',
    coach:
      'La fecha va con el dato: «la guía del Mineduc, de marzo de 2025». Su base está fechada y revisada, así que cuando algo envejece se nota al leerlo.',
  },
  {
    title: 'Está en el marco chileno',
    generic:
      'Por defecto te contesta con el marco estadounidense o europeo, que es de donde viene casi todo lo que leyó. Suena razonable y no es lo que te van a fiscalizar.',
    coach:
      'La Ley 21.719 rige desde el 1 de diciembre de 2026: registro de tratamiento, delegado de datos, brechas en 72 horas. Más la política nacional de IA y las guías del Mineduc.',
  },
  {
    title: 'No promedia la evidencia',
    generic:
      'Resume los estudios hasta que suenan a consenso. El consejo templado que sale de ahí no es de nadie y no te dice qué hacer el lunes.',
    coach:
      'Harvard midió que un tutor de IA duplicó el aprendizaje; PNAS midió un 17% peor con acceso libre. Te dice que se contradicen, y qué diferencia de diseño lo explica.',
  },
  {
    title: 'Te avisa cuando no sabe',
    generic:
      'Si le pides el enlace o el artículo exacto, te lo da igual. A veces existe. La forma de averiguarlo es abrirlo, normalmente delante de otras personas.',
    coach:
      'Si no tiene la referencia, lo dice y te señala dónde se verifica. No construye una dirección web que parezca plausible.',
  },
  {
    title: 'Vuelve a preguntarte',
    generic:
      'La conversación termina y ahí queda. Cierras la pestaña con buenas ideas y nada que hacer, y nadie se entera de si pasó algo con ellas.',
    coach:
      'Cierras con una cosa, con fecha y con qué señal contaría como que salió bien. La próxima vez que entres está en pantalla antes de elegir nada, y lo primero que hace el coach es preguntarte qué pasó.',
  },
] as const;

/**
 * The comparison nobody makes out loud, and the one that decides whether this
 * is worth paying for.
 *
 * `DIFFERENCES` argues against a general assistant, which is the objection
 * visitors voice. This argues against the real competitor: the pile of books,
 * courses and saved podcasts that were bought with the same intention and never
 * turned into anything. Most people reading this page have that pile, and they
 * have learned from it that buying the material is not the hard part.
 *
 * Every row here must name a mechanism that exists in the product, not an
 * aspiration. The last one is load-bearing: it is the reason the commitment is
 * stored on `coach_sessions` rather than left inside a transcript.
 */
export const AGAINST_SHELF = [
  {
    title: 'No aprendes por si acaso',
    body: 'Un curso te enseña el temario completo por si algún día lo necesitas. Aquí entras con lo que te tiene atascado hoy, y la respuesta se mide por si te desbloquea esta semana.',
  },
  {
    title: 'Te pregunta antes de responder',
    body: 'Un libro no sabe nada de tu caso. El coach busca la única cosa que cambia el consejo —una pregunta, no un cuestionario— y recién entonces se moja con una recomendación.',
  },
  {
    title: 'Sales con una cosa, no con apuntes',
    body: 'Una lista de diez ideas se olvida entera. El coach cierra con un solo paso, el más barato que resuelve tu duda más grande, con plazo y con la señal que dirá si funcionó.',
  },
  {
    title: 'Y te pregunta si lo hiciste',
    body: 'Esto es lo que ningún libro, curso ni chat puede hacer: volver. Tu compromiso te espera al entrar, y la siguiente sesión empieza por ahí. Si no lo hiciste, lo primero es averiguar qué te lo impidió.',
  },
] as const;

/**
 * The comparison, offered as something to run rather than something to believe.
 *
 * Every claim above is only as good as a visitor's willingness to take our word
 * for it, which for a page selling an AI product is not much. These are three
 * questions where the difference is visible in one exchange, with what to look
 * for in each answer — including where a general assistant is *right*, because
 * a rigged test is worth nothing and gets noticed.
 *
 * Each `expect` must be something the corpus actually contains. If a document
 * is removed, the row goes with it.
 *
 * `coach` names where to ask, and it is load-bearing rather than a convenience:
 * each corpus is attached to one agent only, so asking the Ley 21.719 question
 * of the emprendedores coach correctly gets a refusal. Sending somebody to the
 * wrong one would read as the test failing.
 */
export const PROOF = [
  {
    // Not a fact-recall test like the others, and that is the point: the three
    // below can in principle be closed by a better-trained model, this one
    // cannot, because it is about the product coming back rather than about
    // what it knows.
    coach: 'Cualquier coach',
    question: 'Termina una sesión, vuelve mañana y no digas nada.',
    generic: 'Empieza de cero. Cada conversación es la primera que tuvo contigo.',
    expect:
      'Tu compromiso en pantalla antes de elegir coach, y el coach preguntándote qué pasó con él antes de proponerte nada nuevo.',
  },
  {
    coach: 'IA para implementación estratégica',
    question: '¿Desde cuándo rige la Ley 21.719 y qué me obliga a hacer?',
    generic: 'Suele acertar el nombre y aproximar la fecha, o contestar con el marco europeo.',
    expect: '1 de diciembre de 2026, registro de actividades de tratamiento, delegado de datos, notificación de brechas en 72 horas.',
  },
  {
    coach: 'IA para colegios',
    question: '¿Qué guía publicó el Mineduc sobre IA en el aula y de qué fecha es?',
    generic: 'Material nacional de 2025 que la mayoría de los modelos apenas ha visto.',
    expect: '«PotencIA el Aprendizaje», 12 de marzo de 2025, con Fundación Chile y CENIA.',
  },
  {
    coach: 'IA para colegios',
    question: '¿Cuánto peor rindieron los estudiantes con acceso libre a GPT-4?',
    generic: 'Recuerda que el estudio existe y suele redondear o cambiar la cifra.',
    expect: '17% por debajo del grupo de control, en la prueba sin la herramienta. Bastani y otros, PNAS 2025.',
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
  {
    title: 'Y la próxima vez empieza por ahí',
    body: 'Tu compromiso queda guardado, no en la transcripción: lo ves al entrar, antes de elegir coach. La sesión siguiente arranca preguntándote qué pasó con él, y si no lo hiciste, por qué. Un compromiso por el que nadie vuelve a preguntar era solo un consejo.',
  },
] as const;
