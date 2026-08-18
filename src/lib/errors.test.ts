/**
 * A dropped connection under the buy button.
 *
 * These components already throw their own message for anything the server says,
 * and those are written in Spanish for the person reading them. What is not is
 * the request never leaving: `fetch` rejects with a TypeError the browser words
 * itself, and that string went into the error box under "Contratar Fundador".
 *
 * The negative cases matter more than the positive ones. A TypeError is also
 * what a genuine bug in our own code throws, and telling somebody to check their
 * connection would send them looking somewhere nothing is wrong.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { connectionMessage, liveCallMessage } from './errors';

const as = (name: string, message: string): Error => {
  const err = new Error(message);
  err.name = name;
  return err;
};

describe('a request that never left', () => {
  it('recognises what each browser calls it', () => {
    for (const message of ['Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.']) {
      const said = connectionMessage(as('TypeError', message));
      assert.ok(said, `not recognised: ${message}`);
      assert.match(said, /conexión/i);
      assert.doesNotMatch(said, /fetch|failed|network/i, 'must not leak the English it replaces');
    }
  });

  it('says something different when the page gave up waiting', () => {
    for (const name of ['AbortError', 'TimeoutError']) {
      assert.match(connectionMessage(as(name, 'aborted')) ?? '', /tardó demasiado/i);
    }
  });

  it('leaves a real bug alone, so nobody is sent to check their wifi', () => {
    assert.equal(connectionMessage(as('TypeError', "Cannot read properties of undefined")), null);
    assert.equal(connectionMessage(as('TypeError', 'x is not a function')), null);
  });

  it('leaves our own messages alone', () => {
    // What /api/checkout answers when Stripe is unconfigured. It is already
    // written for the reader and must reach them unchanged.
    const ours = new Error('Los pagos todavía no están habilitados en este despliegue.');
    assert.equal(connectionMessage(ours), null);
  });

  it('says nothing about things that are not errors', () => {
    for (const value of [null, undefined, 'Failed to fetch', { message: 'Failed to fetch' }, 42]) {
      assert.equal(connectionMessage(value), null);
    }
  });
});

/*
 * A fault mid-class, where the only move is to press the button again.
 *
 * This one translates by default, unlike `micMessage`, and the difference is the
 * point: a denied microphone names a setting somebody can go and grant, while a
 * WebSocket close code names nothing a learner can act on. Showing it to a
 * person who was mid-sentence is noise; losing it entirely would be worse, so it
 * goes to the console.
 */
describe('a class that broke while it was running', () => {
  it('says the connection went, when that is what went', () => {
    for (const raw of ['WebSocket closed unexpectedly', 'Connection timeout', 'network disconnect']) {
      const said = liveCallMessage(raw);
      assert.match(said, /conexión/i);
      assert.match(said, /botón/i, 'must say what to do');
    }
  });

  it('distinguishes a lost microphone, which has a different fix', () => {
    const said = liveCallMessage('Audio worklet failed to start');
    assert.match(said, /micrófono/i);
    assert.match(said, /otra aplicación/i);
  });

  it('still says something useful about a fault it cannot classify', () => {
    const said = liveCallMessage('Cannot read properties of undefined (reading Y)');
    assert.match(said, /clase se cortó/i);
    assert.doesNotMatch(said, /undefined|Cannot|properties/, 'never shows the internals');
  });

  /*
   * Written expecting a pass-through for Spanish, which is how the accent
   * heuristic that used to be here was found to be wrong: this sentence has no
   * accent in it. The gate's message never reaches this function anyway — it is
   * refused at /api/signed-url, before a socket exists — so what this pins now
   * is that everything arriving here is treated as what it is, platform text.
   */
  it('does not try to guess the language of what it was handed', () => {
    const gate = 'Se te acabaron los minutos del plan gratis. Mira los planes para seguir.';
    assert.match(liveCallMessage(gate), /clase se cortó/i);
  });

  it('handles an empty message rather than showing a blank alert', () => {
    assert.match(liveCallMessage('   '), /clase se cortó/i);
  });
});
