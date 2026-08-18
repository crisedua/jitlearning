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

/*
 * The third place the same number is said.
 *
 * The teacher paces the class off one sentence in `registro`, and the persona
 * branches on it: under a threshold it skips the map and spends everything on
 * finishing and measuring the task. That sentence used to carry the monthly
 * balance, so a paid learner's teacher read "300 minutos" and opened at leisure
 * inside a call the platform ends after CLASS_CAP_MINUTES.
 */
describe('what the teacher is told it has', () => {
  const route = read('src', 'app', 'api', 'signed-url', 'route.ts');
  const persona = read('src', 'lib', 'agent.ts');

  it('is bounded by the length of a class, not the balance', () => {
    assert.match(
      route,
      /Math\.min\(left \?\? CLASS_CAP_MINUTES, CLASS_CAP_MINUTES\)/,
      'the record is quoting the balance to the teacher again',
    );
  });

  it('describes the class rather than the month', () => {
    assert.match(route, /Esta clase dura/);
    assert.doesNotMatch(route, /Le queda\$\{left === 1/);
  });

  it('still says when the balance is the shorter of the two', () => {
    assert.match(route, /porque es todo lo que le queda/);
  });

  it('leaves the persona reading the class length, not the remaining minutes', () => {
    assert.match(persona, /El registro te dice cuánto dura esta clase/);
    assert.doesNotMatch(persona, /El registro te dice cuántos minutos le quedan/);
  });

  it('keeps the persona threshold above the real class length', () => {
    // Otherwise the branch that protects a short class can never be taken.
    const m = persona.match(/Si son menos de (\w+) minutos, salta el mapa/);
    assert.ok(m, 'the map-skipping rule is gone');
    const words: Record<string, number> = { diez: 10, quince: 15, veinte: 20, treinta: 30 };
    const threshold = words[m[1]];
    assert.ok(threshold, `unrecognised threshold "${m[1]}"`);
    assert.ok(
      threshold >= CLASS_CAP_MINUTES,
      `a ${CLASS_CAP_MINUTES}-minute class never trips a ${threshold}-minute rule`,
    );
  });
});
