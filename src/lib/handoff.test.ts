import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handoffFor, handoffs, handoffNote, MAX_URL_PROMPT } from './handoff';
import { PRACTICE_MODELS } from './practica';

const PROMPT = 'Consolida estos tres archivos en una tabla y súmame los totales por cliente.';

describe('sending the learner to the real product', () => {
  it('offers the same three the bench does, in the same order', () => {
    assert.deepEqual(
      handoffs(PROMPT).map((h) => h.id),
      PRACTICE_MODELS.map((m) => m.id),
    );
  });

  it('goes to the real product, never to us', () => {
    for (const h of handoffs(PROMPT)) {
      assert.match(h.url, /^https:\/\/(gemini\.google\.com|chatgpt\.com|claude\.ai)\//, h.url);
    }
  });

  it('carries the prompt where the product takes one', () => {
    const chatgpt = handoffFor('chatgpt', PROMPT);
    assert.equal(chatgpt.prefilled, true);
    assert.ok(chatgpt.url.includes(encodeURIComponent('Consolida estos tres archivos')));
  });

  it('escapes the prompt rather than pasting it into a URL raw', () => {
    const h = handoffFor('claude', 'suma A & B, ¿ok? #1');
    assert.ok(!h.url.includes('&B'), 'an unescaped & would truncate the prompt at the next param');
    assert.ok(!h.url.includes('#1'), 'an unescaped # would drop everything after it');
  });

  /*
   * Gemini has no prefill parameter anybody should rely on. Inventing one would
   * be silently ignored, which looks exactly like a working one until the
   * learner reads an empty box — so it says so instead, and the caller tells
   * them to paste.
   */
  it('admits when it cannot prefill instead of guessing a parameter', () => {
    const gemini = handoffFor('gemini', PROMPT);
    assert.equal(gemini.prefilled, false);
    assert.equal(gemini.url, 'https://gemini.google.com/app');
  });

  /*
   * A truncated prompt is the worst outcome available here: the learner lands
   * in the real product with three quarters of an instruction, sends it, and
   * gets a plausible answer to the wrong question. Past the cap the clipboard
   * does the whole job, which it can.
   */
  it('keeps a long prompt out of the URL rather than risking truncation', () => {
    const long = 'a'.repeat(MAX_URL_PROMPT + 1);
    const h = handoffFor('chatgpt', long);
    assert.equal(h.prefilled, false);
    assert.equal(h.url, 'https://chatgpt.com/');
  });

  it('takes a prompt exactly at the cap', () => {
    assert.equal(handoffFor('chatgpt', 'a'.repeat(MAX_URL_PROMPT)).prefilled, true);
  });

  it('sends an empty prompt nowhere in particular, not to an empty query', () => {
    const h = handoffFor('chatgpt', '   ');
    assert.equal(h.prefilled, false);
    assert.ok(!h.url.includes('?'), h.url);
  });

  /*
   * The two notes have to differ, because the instruction differs: one of them
   * has to paste. A single hedged sentence covering both is how somebody
   * concludes the button did nothing.
   */
  it('tells the learner to paste exactly when they have to', () => {
    assert.match(handoffNote(handoffFor('gemini', PROMPT)), /[Pp]égala/);
    assert.doesNotMatch(handoffNote(handoffFor('chatgpt', PROMPT)), /Pégala en/);
  });

  it('names the product in either note, so the tab that opened is identifiable', () => {
    for (const h of handoffs(PROMPT)) {
      assert.ok(handoffNote(h).includes(h.label), `${h.id}: note does not name the product`);
    }
  });
});
