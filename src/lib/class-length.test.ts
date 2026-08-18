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
    assert.ok(when.close > 0 && when.close < 6);
    assert.equal(when.last, 5);
  });

  /*
   * The closing is short work — finish what is open, ask how long it took, say
   * the difference, take a commitment — and it was taking half the class,
   * because five minutes was calibrated against a class three times longer.
   * What needs the time is the task, since a class that does not finish one
   * produces no second number and therefore nothing to sell.
   */
  it('leaves most of the class for the task', () => {
    for (const balance of [6, 8, 10, 20, 300]) {
      const when = wrapUpAt(balance);
      if (!when) continue;
      const end = Math.min(balance, CLASS_CAP_MINUTES);
      assert.ok(
        when.close / end >= 0.6,
        `a ${end}-minute class spends only ${when.close} min on the task before closing`,
      );
    }
  });

  it('always leaves at least two minutes to close in', () => {
    // The subtraction and the commitment both have to fit.
    for (const balance of [3, 6, 10, 300]) {
      const when = wrapUpAt(balance);
      if (!when) continue;
      const end = Math.min(balance, CLASS_CAP_MINUTES);
      assert.ok(end - when.close >= 1.99, `only ${end - when.close} min to close a ${end}-min class`);
    }
  });

  it('tells the teacher the real number of minutes left, not a fixed one', () => {
    assert.equal(wrapUpAt(300)!.closeRemaining, 3);
    const tutor = read('src', 'components', 'VoiceTutor.tsx');
    assert.match(tutor, /Quedan unos \$\{when\.closeRemaining\} minutos/);
    assert.doesNotMatch(tutor, /Quedan unos 5 minutos/);
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

/*
 * The learner is told the length before they need it.
 *
 * The balance note says what is left, and a class ends at the ceiling whatever
 * that is. Somebody reading "20 de 20 minutos" and getting cut at ten has been
 * shortchanged as far as they can tell, and the second class they are entitled
 * to looks like a workaround rather than the design.
 */
describe('what the learner is told before pressing start', () => {
  const note = read('src', 'components', 'BalanceNote.tsx');

  it('says how long a class is', () => {
    assert.match(note, /Cada clase dura \{CLASS_CAP_MINUTES\} minutos/);
  });

  it('says it only when the ceiling is what ends the class', () => {
    // With less than a full class left, the balance is the shorter of the two
    // and naming the ceiling would be wrong as well as noisy.
    assert.match(note, /left !== null && left > CLASS_CAP_MINUTES/);
  });

  it('takes the figure from the same place the agent does', () => {
    assert.doesNotMatch(note, /dura 10 minutos|dura quince|15 minutos/);
    assert.match(note, /from '@\/lib\/class-length'/);
  });
});

/*
 * What the second class knows about the first.
 *
 * The free tier is two classes at the ceiling. If the first ends before the
 * second number is asked for, the task is chosen and `minutes_before` is
 * already stored — half a subtraction, sitting in the database with nothing to
 * subtract from it.
 *
 * The record the teacher opens on carries the plan step but said nothing about
 * that, so the second class had no way to know it was one question from the
 * only outcome that matters, and a learner could spend their entire free
 * allowance without ever hearing a subtraction.
 */
describe('resuming a measurement the ceiling interrupted', () => {
  const progress = read('src', 'lib', 'progress.ts');

  it('tells the teacher when a step is half measured', () => {
    assert.match(
      progress,
      /minutesBefore !== null && current\.step\.minutesAfter === null/,
      'the record no longer notices a task with only its first number',
    );
  });

  it('says what to do about it, not just that it happened', () => {
    assert.match(progress, /falta[\s\S]{0,40}el segundo número/);
    assert.match(progress, /pregúntale cuánto tardó ahora/);
  });

  it('quotes the number the learner gave rather than describing it', () => {
    assert.match(progress, /spellMinutes\(current\.step\.minutesBefore\)/);
  });

  it('only fires while the second number is genuinely missing', () => {
    // Once both are in, the step is measured and the saving speaks for itself;
    // repeating the question would ask for something already given.
    assert.doesNotMatch(progress, /minutesBefore !== null &&\s*current\.step\.minutesAfter !== null/);
  });
});

/*
 * Settings the agent keeps its own copy of have to be re-sent, not only written
 * once at creation. That was how the class ceiling came to sit at a value
 * nothing in this repo had chosen, undetected for as long as the project had
 * existed.
 */
describe('agent settings that only existed at creation', () => {
  const agent = read('src', 'lib', 'agent.ts');

  it('shares one source between the created agent and the synced one', () => {
    assert.equal(
      (agent.match(/turn: turnConfig\(\)/g) ?? []).length,
      2,
      'the turn config is written in one place and synced in another again',
    );
    assert.equal((agent.match(/conversation: conversationConfig\(\)/g) ?? []).length, 2);
  });

  it('waits longer than a person takes to do the step it just named', () => {
    // The persona's working mode is "un paso por turno, esperando que
    // confirme". Opening a file and pasting a draft take longer than the stock
    // eight seconds, and prompting into that spends the little time the task has.
    const m = agent.match(/turn_timeout: ([\d.]+)/);
    assert.ok(m, 'the turn timeout is no longer stated');
    const seconds = Number(m[1]);
    assert.ok(seconds >= 12, `${seconds}s talks over somebody doing what was asked`);
    assert.ok(seconds <= 30, 'the platform refuses more than 30');
  });
});
