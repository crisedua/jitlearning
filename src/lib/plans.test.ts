/**
 * How the value claim reads out loud.
 *
 * `spellMinutes` renders the recovered-hours figure, which sits directly above
 * the price and is the only claim this product makes about its own worth. It is
 * pure arithmetic on a number the learner supplied, so the arithmetic was never
 * the risk. The grammar was: it pluralised `hora` and not `minuto`, so any total
 * ending in one read "1 minutos".
 *
 * A small error in the one sentence whose whole job is to look careful.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { spellMinutes } from './plans';
import { WEEKLY_MAX, WEEKLY_MIN } from './curriculum';

describe('saying a saving out loud', () => {
  it('uses the singular for one minute', () => {
    assert.equal(spellMinutes(1), '1 minuto');
    assert.equal(spellMinutes(61), '1 hora y 1 minuto');
    assert.equal(spellMinutes(121), '2 horas y 1 minuto');
  });

  it('uses the plural for everything else', () => {
    assert.equal(spellMinutes(2), '2 minutos');
    assert.equal(spellMinutes(59), '59 minutos');
    assert.equal(spellMinutes(65), '1 hora y 5 minutos');
  });

  it('uses the singular for one hour', () => {
    assert.equal(spellMinutes(60), '1 hora');
    assert.equal(spellMinutes(90), '1 hora y 30 minutos');
  });

  it('drops the minutes on a whole number of hours', () => {
    assert.equal(spellMinutes(120), '2 horas');
    assert.equal(spellMinutes(180), '3 horas');
  });

  it('gets the plural right at every size a learner could reach', () => {
    // Ten hours is far past any real weekly saving, which is the point: the
    // sentence has to hold for whatever number they actually produce.
    for (let n = 1; n <= 600; n++) {
      const said = spellMinutes(n);
      assert.ok(!/\b1 minutos\b/.test(said), said);
      assert.ok(!/\b1 horas\b/.test(said), said);
      assert.ok(!/\b(?!1\b)\d+ minuto\b/.test(said), said);
      assert.ok(!/\b(?!1\b)\d+ hora\b/.test(said), said);
      assert.ok(!/\by 0 minutos?\b/.test(said), said);
    }
  });
});

/**
 * The bullets under a price cannot contradict the price they sit under.
 *
 * The card renders the allowance from `plans.monthly_minutes` and then lists
 * features underneath. Those features used to be literals, so the same figure
 * appeared twice on one card — once from the database and once from a string.
 * The whole premise of this page is that changing a price is a row update rather
 * than a deploy, which is exactly the change that would have moved one and left
 * the other.
 */
import { FALLBACK_PLANS, formatMinutes, planFeatures } from './plans';

describe('what a plan card claims', () => {
  it('states the allowance the plan actually has', () => {
    for (const plan of FALLBACK_PLANS) {
      const said = planFeatures(plan).join(' | ');
      assert.ok(
        said.includes(formatMinutes(plan.monthlyMinutes)),
        `${plan.id}: features never mention ${formatMinutes(plan.monthlyMinutes)} — ${said}`,
      );
    }
  });

  it('follows the allowance when the database changes it', () => {
    // The failure this replaces: an operator lowers the founder tier in Postgres
    // and the headline moves while the bullet keeps quoting the old number.
    const founder = FALLBACK_PLANS.find((p) => p.id === 'founder')!;
    const lowered = planFeatures({ ...founder, monthlyMinutes: 120 }).join(' | ');
    assert.ok(lowered.includes('120'), lowered);
    assert.ok(!lowered.includes('300'), `still quoting the old allowance: ${lowered}`);
  });

  it('says the free tier is not monthly, because it is not', () => {
    const free = FALLBACK_PLANS.find((p) => p.period === 'total')!;
    assert.ok(planFeatures(free).some((f) => f.includes('en total')), 'free reads as monthly');
  });

  it('quotes a task range the curriculum can actually build', () => {
    const founder = FALLBACK_PLANS.find((p) => p.id === 'founder')!;
    const said = planFeatures(founder).join(' | ');
    assert.ok(said.includes(`${WEEKLY_MIN} a ${WEEKLY_MAX}`), said);
  });
});
