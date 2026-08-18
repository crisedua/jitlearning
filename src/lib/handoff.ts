/**
 * Handing the learner over to the real product, with their prompt in hand.
 *
 * The practice bench runs the models. It does not run Gemini, ChatGPT or
 * Claude — the products refuse to be embedded (`x-frame-options: DENY` on
 * gemini.google.com, `default-src 'none'` on claude.ai, `SAMEORIGIN` on
 * chatgpt.com) and driving somebody's logged-in account from our page is not on
 * the table. So the bench is a rehearsal, and this is the door out of it.
 *
 * ## Why this matters more than it looks
 *
 * Level 1 sells a weekly saving that repeats. A saving that only exists while
 * somebody keeps paying us is not that, so the learner has to end up doing the
 * task in their own account — and "abre Gemini y pega lo que te dicté" is a
 * paragraph of instructions given by voice to somebody who is already tired.
 * One button that opens the real product with the text already there is the
 * same instruction with the friction removed.
 *
 * ## The design rule: the clipboard is the product, the URL is a bonus
 *
 * ChatGPT and Claude accept a query parameter that opens a new chat prefilled.
 * Neither is documented, both have moved before, and both sit behind bot
 * protection that makes them impossible to verify from a server. Gemini has no
 * such parameter that anyone should rely on.
 *
 * So nothing here depends on them working. The caller copies the prompt to the
 * clipboard *first* and then opens the product; if the parameter is honoured
 * the learner sees their text already typed, and if it is silently dropped they
 * paste. The failure mode of the whole feature is "you have to press ⌘V",
 * which is exactly what they would have done anyway.
 *
 * Pure: no React, no I/O. `handoff.test.ts` covers it.
 */
import { PRACTICE_MODELS, type PracticeModelId } from './practica';

/**
 * How long a prompt may be before it stops riding in the URL.
 *
 * Browsers and CDNs disagree about the real ceiling and none of them announce
 * it: past some length the request is truncated or refused, and a *truncated*
 * prompt is the worst outcome available here — the learner lands in the real
 * product with three quarters of their instruction, sends it, and gets a
 * plausible answer to the wrong question. Below the limit the parameter is a
 * convenience; above it the clipboard does the whole job, which it can.
 *
 * 1,200 is well inside every documented limit. The prompts this carries are
 * three to six lines, so the cap is rarely reached, and when it is the learner
 * loses nothing but a keystroke.
 */
export const MAX_URL_PROMPT = 1_200;

export interface Handoff {
  id: PracticeModelId;
  /** The product's name, as the learner knows it. */
  label: string;
  /** Where to send them. Carries the prompt when it fits and the product takes one. */
  url: string;
  /**
   * Whether `url` actually carries the prompt.
   *
   * The caller uses this to decide what to say. "Te lo copié, pégalo allá" is
   * the honest sentence when the text is only on the clipboard, and promising a
   * prefilled box that does not appear is how somebody concludes the button is
   * broken and stops pressing it.
   */
  prefilled: boolean;
}

/**
 * Per product: where it lives, and how it takes a prompt if it takes one.
 *
 * `prefill` is null where no parameter can be relied on. That is not a gap to
 * fill later by guessing — an invented parameter is silently ignored, which
 * looks identical to a working one right up until the learner reads an empty
 * box and has to ask what went wrong.
 */
const PRODUCTS: Record<PracticeModelId, { home: string; prefill: ((p: string) => string) | null }> = {
  gemini: {
    home: 'https://gemini.google.com/app',
    prefill: null,
  },
  chatgpt: {
    home: 'https://chatgpt.com/',
    prefill: (p) => `https://chatgpt.com/?q=${encodeURIComponent(p)}`,
  },
  claude: {
    home: 'https://claude.ai/new',
    prefill: (p) => `https://claude.ai/new?q=${encodeURIComponent(p)}`,
  },
};

/** Where to send this learner, for one product. */
export function handoffFor(id: PracticeModelId, prompt: string): Handoff {
  const product = PRODUCTS[id];
  const label = PRACTICE_MODELS.find((m) => m.id === id)?.label ?? id;
  const text = prompt.trim();

  const canPrefill = Boolean(product.prefill) && text.length > 0 && text.length <= MAX_URL_PROMPT;

  return {
    id,
    label,
    url: canPrefill ? product.prefill!(text) : product.home,
    prefilled: canPrefill,
  };
}

/** All three, in the order the picker shows them. */
export function handoffs(prompt: string): Handoff[] {
  return PRACTICE_MODELS.map((m) => handoffFor(m.id, prompt));
}

/**
 * What to tell the learner after the click, in one line.
 *
 * Written for the two cases rather than one hedged sentence covering both,
 * because the instruction genuinely differs: one of them has to paste.
 */
export function handoffNote(handoff: Handoff): string {
  return handoff.prefilled
    ? `Se abre ${handoff.label} con tu petición ya escrita. Igual la copiamos, por si acaso.`
    : `Te copiamos la petición. Pégala en ${handoff.label} cuando abra.`;
}
