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
import type { Plan } from './plans';
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
import {
  approximateSessions,
  ASSUMED_SESSION_MINUTES,
  dominatedBy,
  FALLBACK_PLANS,
  formatMinutes,
  planFeatures,
} from './plans';

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

/**
 * One number for how long a class takes.
 *
 * `approximateSessions` turns an allowance into "unas N clases" on the pricing
 * page. The landing page's how-it-works heading and the empty notebook both
 * quoted the same figure as prose. Three encodings of one estimate, and this
 * particular estimate has already been wrong in public: it was 8 when a session
 * meant one answered question, and the pricing page promised 37 classes out of
 * an allowance holding 20.
 */
describe('how long a class is assumed to take', () => {
  it('divides an allowance into whole classes', () => {
    assert.equal(approximateSessions(ASSUMED_SESSION_MINUTES * 4), 4);
    assert.equal(approximateSessions(ASSUMED_SESSION_MINUTES * 4 - 1), 3);
  });

  it('is null for a plan that does not meter minutes', () => {
    assert.equal(approximateSessions(null), null);
  });

  it('never promises more classes than the free tier can hold', () => {
    // The exact failure this constant caused once.
    const free = FALLBACK_PLANS.find((p) => p.period === 'total')!;
    const promised = approximateSessions(free.monthlyMinutes) ?? 0;
    assert.ok(
      promised * ASSUMED_SESSION_MINUTES <= (free.monthlyMinutes ?? 0),
      `promises ${promised} classes out of ${free.monthlyMinutes} minutes`,
    );
  });
});

/*
 * The dominated tier.
 *
 * `dominatedBy` decides whether /planes offers a plan or shows it as a list
 * price. Getting it wrong in one direction puts a strictly worse purchase in
 * front of somebody deciding whether to trust this product with money; in the
 * other it hides a tier the operator is trying to sell.
 */
describe('dominatedBy', () => {
  const base = FALLBACK_PLANS.find((p) => p.id === 'founder')!;
  const plan = (over: Partial<Plan>): Plan => ({ ...base, ...over }) as Plan;

  it('names the cheaper plan when the dearer one gives no more', () => {
    const cheap = plan({ id: 'a', priceMinor: 900, monthlyMinutes: 300 });
    const dear = plan({ id: 'b', priceMinor: 1900, monthlyMinutes: 300 });
    assert.equal(dominatedBy(dear, [cheap, dear])?.id, 'a');
    assert.equal(dominatedBy(cheap, [cheap, dear]), null);
  });

  it('leaves a real ladder alone: more money buys more minutes', () => {
    const cheap = plan({ id: 'a', priceMinor: 900, monthlyMinutes: 120 });
    const dear = plan({ id: 'b', priceMinor: 1900, monthlyMinutes: 300 });
    assert.equal(dominatedBy(dear, [cheap, dear]), null);
  });

  /*
   * The property the page depends on. The demotion is derived, so applying
   * `supabase/optional/founder_allowance_120.sql` has to restore the card
   * without anybody editing this file.
   */
  it('stops demoting once the cheaper allowance drops', () => {
    const dear = plan({ id: 'standard', priceMinor: 1900, monthlyMinutes: 300 });
    const before = plan({ id: 'founder', priceMinor: 900, monthlyMinutes: 300 });
    const after = plan({ id: 'founder', priceMinor: 900, monthlyMinutes: 120 });
    assert.ok(dominatedBy(dear, [before, dear]), 'dominated at 300');
    assert.equal(dominatedBy(dear, [after, dear]), null, 'not dominated at 120');
  });

  it('treats unlimited as beating any number, in both directions', () => {
    const unlimited = plan({ id: 'a', priceMinor: 900, monthlySessions: null });
    const counted = plan({ id: 'b', priceMinor: 1900, monthlySessions: 8 });
    assert.ok(dominatedBy(counted, [unlimited, counted]));
    const cheapCounted = plan({ id: 'a', priceMinor: 900, monthlySessions: 4 });
    const dearUnlimited = plan({ id: 'b', priceMinor: 1900, monthlySessions: null });
    assert.equal(dominatedBy(dearUnlimited, [cheapCounted, dearUnlimited]), null);
  });

  it('does not compare across currencies or against hidden and free tiers', () => {
    const clp = plan({ id: 'a', priceMinor: 900, currency: 'CLP' });
    const usd = plan({ id: 'b', priceMinor: 1900, currency: 'USD' });
    assert.equal(dominatedBy(usd, [clp, usd]), null);

    const hidden = plan({ id: 'a', priceMinor: 900, isPublic: false });
    assert.equal(dominatedBy(usd, [hidden, usd]), null);

    const free = plan({ id: 'a', priceMinor: 0 });
    assert.equal(dominatedBy(usd, [free, usd]), null);
    assert.equal(dominatedBy(free, [free, usd]), null, 'the free tier is never demoted');
  });

  it('names the cheapest alternative, not merely a cheaper one', () => {
    const cheapest = plan({ id: 'a', priceMinor: 500 });
    const middle = plan({ id: 'b', priceMinor: 900 });
    const dear = plan({ id: 'c', priceMinor: 1900 });
    assert.equal(dominatedBy(dear, [middle, cheapest, dear])?.id, 'a');
  });
});
