/**
 * The normalising step, which is the only part of storing a class that can be
 * wrong without anybody noticing.
 *
 * A crash in the webhook is loud. A transcript quietly stored as `[]` because a
 * third party renamed a field looks exactly like a class where nobody spoke,
 * and the learner is the one who finds out.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { trimTurns } from './transcripts';

const REAL = [
  { role: 'agent', message: '', time_in_call_secs: 0, tool_calls: [], llm_usage: {} },
  { role: 'agent', message: '¿Empezamos? Cuéntame a qué te dedicas.', time_in_call_secs: 0 },
  { role: 'user', message: 'Hago informes semanales.', time_in_call_secs: 7 },
];

describe('keeping a class readable', () => {
  it('keeps the three fields a learner reads and drops the rest', () => {
    assert.deepEqual(trimTurns(REAL).at(-1), {
      role: 'user',
      message: 'Hago informes semanales.',
      at: 7,
    });
  });

  /*
   * ElevenLabs really does emit these: a live class opens with two agent turns
   * at 0s carrying no text. Kept, they render as blank bubbles above the first
   * thing anybody said.
   */
  it('drops the empty turns the platform opens with', () => {
    assert.equal(trimTurns(REAL).length, 2);
  });

  it('treats anything that is not `user` as the teacher', () => {
    const roles = trimTurns([
      { role: 'user', message: 'a' },
      { role: 'agent', message: 'b' },
      { role: 'system', message: 'c' },
      { message: 'd' },
    ]).map((t) => t.role);
    assert.deepEqual(roles, ['user', 'agent', 'agent', 'agent']);
  });

  /*
   * A missing timestamp used to be the interesting case: `Number(undefined)` is
   * NaN, `JSON.stringify` turns NaN into null, and the page reads back a turn
   * whose clock is broken rather than zero.
   */
  it('never stores a timestamp that is not a number', () => {
    for (const at of [undefined, null, 'hace rato', NaN, -5]) {
      const [turn] = trimTurns([{ role: 'user', message: 'x', time_in_call_secs: at }]);
      assert.equal(turn!.at, 0, `${String(at)} became ${turn!.at}`);
    }
  });

  it('survives a payload that is not the shape it expects', () => {
    for (const junk of [null, undefined, {}, 'texto', 42, [null, 3, 'x', {}]]) {
      assert.deepEqual(trimTurns(junk), [], `threw or kept junk for ${JSON.stringify(junk)}`);
    }
  });

  it('caps one absurd turn instead of storing it whole', () => {
    const [turn] = trimTurns([{ role: 'user', message: 'a'.repeat(50_000) }]);
    assert.ok(turn!.message.length < 50_000);
    assert.ok(turn!.message.length >= 8_000, 'a real sentence must survive intact');
  });

  it('caps a runaway payload instead of building a page nobody can open', () => {
    const many = Array.from({ length: 5_000 }, () => ({ role: 'user', message: 'x' }));
    assert.ok(trimTurns(many).length <= 2_000);
  });

  /*
   * Reading a class back has to give the same class. `readTranscript` runs its
   * stored value through this function again, so a round trip that changed
   * anything would mean the page and the row disagree.
   */
  it('is stable when run over its own output', () => {
    const once = trimTurns(REAL);
    assert.deepEqual(trimTurns(once), once);
  });
});
