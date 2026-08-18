import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLASS_CAP_MINUTES, CLASS_CAP_SECONDS, wrapUpAt } from './class-length';
import { FALLBACK_PLANS } from './plans';

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8');

/*
 * The class has to reach its own ending.
 *
 * Everything this product sells happens in the last two minutes of a session:
 * the teacher closes the task, asks what it takes now, says the subtraction out
 * loud, and takes a commitment. The notebook counts that subtraction, the offer
 * is priced against it, and the persona is forbidden from inventing it.
 *
 * The two prompts that cause it were scheduled against the learner's balance
 * while the platform hung up on a fixed ceiling, so for every real balance they
 * were scheduled past the end of the call and never fired once.
 */
describe('when the teacher is told to wrap up', () => {
  it('fires before the platform hangs up, on the free tier', () => {
    const free = FALLBACK_PLANS.find((p) => p.priceMinor === 0)!.monthlyMinutes!;
    const when = wrapUpAt(free);
    assert.ok(when, 'the free tier gets no wrap-up at all');
    assert.ok(
      when.close < CLASS_CAP_MINUTES && when.last < CLASS_CAP_MINUTES,
      `scheduled at ${when.close} and ${when.last} for a call that ends at ${CLASS_CAP_MINUTES}`,
    );
  });

  it('fires before the platform hangs up, on every paid tier', () => {
    for (const plan of FALLBACK_PLANS.filter((p) => p.priceMinor > 0)) {
      const when = wrapUpAt(plan.monthlyMinutes);
      assert.ok(when, `${plan.name} gets no wrap-up`);
      assert.ok(
        when.last < CLASS_CAP_MINUTES,
        `${plan.name}: last call at ${when.last} min, but the call ends at ${CLASS_CAP_MINUTES}`,
      );
    }
  });

  it('follows the balance when the balance is the thing that ends first', () => {
    const when = wrapUpAt(6)!;
    assert.equal(when.close, 1, 'six minutes left should close five minutes in');
    assert.equal(when.last, 5);
  });

  it('says nothing when there is no room to say it', () => {
    // Under two minutes the warning is the interruption.
    assert.equal(wrapUpAt(2), null);
    assert.equal(wrapUpAt(0), null);
  });

  it('assumes the full class when the balance is unknown, not forever', () => {
    const when = wrapUpAt(null)!;
    assert.ok(when.last < CLASS_CAP_MINUTES);
  });

  it('is never scheduled at or after the end', () => {
    for (let balance = 3; balance <= 400; balance++) {
      const when = wrapUpAt(balance);
      if (!when) continue;
      assert.ok(when.close <= when.last, `out of order at ${balance}`);
      assert.ok(when.last < Math.min(balance, CLASS_CAP_MINUTES) + 0.001, `too late at ${balance}`);
    }
  });
});

describe('the ceiling', () => {
  it('is set by this repo rather than inherited from the platform', () => {
    assert.match(
      read('src', 'lib', 'agent.ts'),
      /max_duration_seconds: CLASS_CAP_SECONDS/,
      'the agent no longer states how long a class may run',
    );
    assert.equal(CLASS_CAP_SECONDS, CLASS_CAP_MINUTES * 60);
  });

  it('is what the classroom schedules against', () => {
    const tutor = read('src', 'components', 'VoiceTutor.tsx');
    assert.match(tutor, /wrapUpAt\(/, 'the classroom is back to scheduling off the balance alone');
    assert.doesNotMatch(tutor, /Math\.max\(left - 5/);
  });
});
