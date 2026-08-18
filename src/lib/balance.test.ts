/**
 * The number three surfaces show the same person in the same session.
 *
 * The offer on /progreso, the record the teacher opens on, and the meter above
 * the start button all say how much allowance is left. They used to compute it
 * separately, so nothing forced them to agree: a rounding change in one would
 * have produced a page saying five minutes, a teacher believing seven, and the
 * session timers firing against a third figure.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { minutesLeft, sessionsLeft, type UsageBalance } from './balance';

const balance = (over: Partial<UsageBalance> = {}): UsageBalance => ({
  minutes: 0,
  sessions: 0,
  monthlyMinutes: 20,
  monthlySessions: null,
  period: 'total',
  ...over,
});

describe('what is left of an allowance', () => {
  it('subtracts what was used', () => {
    assert.equal(minutesLeft(balance({ minutes: 5 })), 15);
  });

  it('floors a partial minute, because half a minute is not a minute you can use', () => {
    assert.equal(minutesLeft(balance({ minutes: 4.2 })), 15);
    assert.equal(minutesLeft(balance({ minutes: 4.9 })), 15);
  });

  it('never goes negative when the soft cap was crossed', () => {
    // Sessions are never cut off mid-call, so spending past the allowance is
    // normal. Showing "-7 minutos" reads as a bug rather than as generosity.
    assert.equal(minutesLeft(balance({ minutes: 27 })), 0);
  });

  it('is null for a plan that does not meter minutes', () => {
    assert.equal(minutesLeft(balance({ monthlyMinutes: null })), null);
  });

  it('is null when there is no balance to read', () => {
    assert.equal(minutesLeft(null), null);
    assert.equal(sessionsLeft(null), null);
  });

  it('counts sessions the same way', () => {
    assert.equal(sessionsLeft(balance({ monthlySessions: 10, sessions: 3 })), 7);
    assert.equal(sessionsLeft(balance({ monthlySessions: 10, sessions: 14 })), 0);
    assert.equal(sessionsLeft(balance({ monthlySessions: null })), null);
  });
});
