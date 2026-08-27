/**
 * What a sign-up is made of, in one place because two files and a check
 * constraint have to agree about it.
 *
 * The form renders the labels, the route validates against the ids, and
 * `signups.employment` in 20260825000000_signups.sql carries a check constraint
 * listing the same three ids. That third one is the reason this file exists
 * rather than the strings living inline: SQL cannot import TypeScript, so the
 * only thing keeping them in step is a test, and a test needs one definition to
 * compare the SQL against.
 */

/**
 * The ids stored in `signups.employment`.
 *
 * English, like every other stored value in this schema, while the labels the
 * person reads are Spanish. Renaming one of these means editing the check
 * constraint in the same commit — `signup.test.ts` fails loudly if it does not.
 */
export const EMPLOYMENT = ['student', 'unemployed', 'employed'] as const;

export type Employment = (typeof EMPLOYMENT)[number];

/**
 * How the three options are put to the person answering.
 *
 * First person and present tense, because the question is "¿en qué estás?" and
 * these are the answers to it. "Busco trabajo" rather than "desempleado": it is
 * the same fact, it is what someone would say about themselves, and this is a
 * form where the honest answer is the useful one.
 */
export const EMPLOYMENT_LABEL: Record<Employment, string> = {
  student: 'Estudio',
  unemployed: 'Busco trabajo',
  employed: 'Trabajo',
};

/** A line of context under each option, so nobody has to guess which they are. */
export const EMPLOYMENT_HINT: Record<Employment, string> = {
  student: 'En el colegio, instituto o universidad.',
  unemployed: 'Sin trabajo ahora mismo, buscando.',
  employed: 'Con trabajo, dependiente o por cuenta propia.',
};

/**
 * A phone number reduced to what is worth storing: a leading `+` if there was
 * one, and digits.
 *
 * Deliberately not a validation of Chilean numbering. People write +56 9 1234
 * 5678, 9 1234 5678, and (56) 912345678 for the same phone, and a form that
 * rejects two of those three loses the sign-up rather than teaching anybody a
 * format. The count is checked by the route; the shape is not.
 */
export function normalisePhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

/** How many digits a real number has, generously bracketed either side. */
export const PHONE_MIN_DIGITS = 8;
export const PHONE_MAX_DIGITS = 15;
