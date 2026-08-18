/**
 * The microphone failures a learner actually meets.
 *
 * This is the first click of the product: the button every call to action points
 * at, on a page somebody reached after reading the argument. `getUserMedia`
 * rejects with a DOMException whose message is written for a developer, in
 * English, and that string went straight into the error box on a Spanish page.
 *
 * On a phone this is most of the failures a voice product ever has, because the
 * permission lives in the operating system and is denied until granted.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { micMessage } from './mic';

/** What a browser actually throws: a DOMException, matched on `name`. */
function thrown(name: string, message = 'Permission denied'): Error {
  const err = new Error(message);
  err.name = name;
  return err;
}

describe('a microphone that will not open', () => {
  it('explains a refusal, and where the permission lives', () => {
    for (const name of ['NotAllowedError', 'SecurityError']) {
      const said = micMessage(thrown(name));
      assert.ok(said, `${name} produced nothing`);
      assert.match(said, /permiso/i);
      assert.match(said, /candado|ajustes/i, 'must say where to change it');
    }
  });

  it('tells somebody with no microphone something they can act on', () => {
    const said = micMessage(thrown('NotFoundError'));
    assert.match(said ?? '', /micrófono/i);
    assert.match(said ?? '', /audífonos|teléfono/i);
  });

  it('names the other application when the device is busy', () => {
    const said = micMessage(thrown('NotReadableError'));
    assert.match(said ?? '', /otra aplicación/i);
  });

  /*
   * The important negative. A wrong translation of an unknown fault is worse
   * than the fault's own words, because it sends somebody to fix a setting that
   * was never the problem.
   */
  it('says nothing about a failure it does not recognise', () => {
    assert.equal(micMessage(thrown('TypeError')), null);
    assert.equal(micMessage(new Error('network down')), null);
    assert.equal(micMessage('a string'), null);
    assert.equal(micMessage(null), null);
    assert.equal(micMessage(undefined), null);
  });

  it('never leaks the browser wording it replaces', () => {
    const said = micMessage(thrown('NotAllowedError', 'Permission denied by system'));
    assert.doesNotMatch(said ?? '', /Permission|denied|user agent/i);
  });
});
