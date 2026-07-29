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
    body: 'No es un curso ni un temario. Le cuentas en qué estás atascado y te da la parte que te desbloquea, en la mitad del tiempo que tardarías en buscarlo.',
    icon: 'bolt',
  },
  {
    title: 'Habla desde tu material, no de oídas',
    body: 'Responde apoyándose en documentos concretos de la base de conocimiento. Y cuando no tiene material sobre algo, te lo dice antes de responder en vez de improvisar con la misma seguridad.',
    icon: 'book',
  },
  {
    title: 'Te lo enseña en pantalla',
    body: 'Para los procedimientos que tiene documentados abre un tutorial ilustrado y va pasando los pasos mientras habla, así lo que oyes y lo que ves van sincronizados.',
    icon: 'screen',
  },
] as const;

/** How a session actually goes, so nobody has to guess before clicking. */
export const STEPS = [
  {
    title: 'Abres el navegador y hablas',
    body: 'Nada que instalar. Le cuentas el problema como se lo contarías a un colega en el pasillo. Pide permiso del micrófono; si prefieres, escribe.',
  },
  {
    title: 'Busca en su base, no en internet',
    body: 'Recupera el fragmento que aplica a tu caso y te dice de dónde sale. Si no tiene material sobre eso, lo dice antes de responder.',
  },
  {
    title: 'Sales con el siguiente paso',
    body: 'Antes de terminar comprueba que lo entendiste pidiéndote que lo apliques a tu caso, no que repitas una definición.',
  },
] as const;
