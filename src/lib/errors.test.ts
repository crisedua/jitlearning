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
import { connectionMessage } from './errors';

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
