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
import { readFileSync } from 'node:fs';
import path from 'node:path';
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
  RECOMMENDED_PLAN_ID,
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

  /*
   * This pinned the founder card to the literal "3 a 5", which was the right
   * check while every paid plan held 300 minutes and the wrong one the moment
   * Fundador dropped to 60: the card correctly stopped saying it, and the test
   * failed for the card telling the truth.
   *
   * The intent underneath was never "founder says 3 a 5" — it was "no card
   * promises more of a week than the curriculum can build". `WEEKLY_MAX` bounds
   * the tasks open at once, so a card claiming six would be selling a plan the
   * curriculum cannot fill. That is what is checked now, for every paid tier.
   *
   * The other half — that a card never claims more than its own allowance holds
   * — lives in purchase.test.ts, against `weeklyTasksCovered`.
   */
  it('never quotes a wider task range than the curriculum can build', () => {
    for (const plan of FALLBACK_PLANS.filter((p) => p.priceMinor > 0 && p.isPublic)) {
      const said = planFeatures(plan).join(' | ');
      const numbers = [...said.matchAll(/(\d+) tareas/g)].map((m) => Number(m[1]));
      for (const n of numbers) {
        assert.ok(
          n <= WEEKLY_MAX,
          `${plan.name} claims ${n} weekly tasks, past the ${WEEKLY_MAX} the curriculum opens: ${said}`,
        );
      }
      assert.ok(
        said.includes('tarea'),
        `${plan.name} says nothing about the weekly task, which is what it sells: ${said}`,
      );
    }
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

/*
 * The pricing page has to stay statically rendered.
 *
 * `loadPlans` exists in the shape it does because this page is public and
 * identical for everyone: reading it from Postgres on every view would be a
 * query per visitor for rows that never differ. Next opts a page out of static
 * rendering the moment it reads `searchParams`, and there is a standing
 * temptation to read one — Stripe returns an abandoned checkout to
 * `/planes?pago=cancelado`, and handling that looks like an obvious small
 * improvement.
 *
 * It is not small. It would turn the page dynamic and undo the reason the
 * fallback and the revalidation were built.
 */
describe('the pricing page stays cacheable', () => {
  it('never reads a search parameter', () => {
    const source = readFileSync(
      path.join(import.meta.dirname, '..', 'app', 'planes', 'page.tsx'),
      'utf8',
    );
    assert.doesNotMatch(
      source,
      /\bsearchParams\b/,
      'reading searchParams here opts the public price list out of static rendering',
    );
  });

  it('still declares a revalidation window', () => {
    const source = readFileSync(
      path.join(import.meta.dirname, '..', 'app', 'planes', 'page.tsx'),
      'utf8',
    );
    assert.match(source, /export const revalidate/, 'the page no longer revalidates');
  });
});

/*
 * Every gate on the offer, in one place.
 *
 * `/progreso` renders it when three things hold: the subscription reads `free`,
 * the learner has measured something, and `recommendedPlan()` returns a plan.
 * Two of those three have already failed in production-shaped ways and both were
 * fixed alone — a missing billing migration made every learner read as having no
 * subscription, and a learner with no profile row read the same way.
 *
 * Each time, somebody finished a task, measured their hours, saw the number, and
 * was never asked to pay. Nothing logged. This is the list of doors into that
 * room, written down so the next one is closed knowing there were three.
 */
describe('what the offer needs to appear', () => {
  it('a recommended plan exists in the compiled rows', () => {
    // The fallback `recommendedPlan()` returns when the database cannot answer.
    // Without it that function can go back to returning null on any error.
    const compiled = FALLBACK_PLANS.find((p) => p.id === RECOMMENDED_PLAN_ID);
    assert.ok(compiled, `no compiled row for ${RECOMMENDED_PLAN_ID}`);
    assert.ok(compiled.priceMinor > 0, 'the recommended plan is free, so there is nothing to offer');
    assert.equal(compiled.stripePriceId, null, 'a compiled row must never open a real checkout');
  });

  it('recommendedPlan cannot answer null while that row exists', () => {
    const source = readFileSync(
      path.join(import.meta.dirname, 'offer.ts'),
      'utf8',
    );
    assert.match(
      source,
      /\?\?\s*COMPILED/,
      'recommendedPlan can answer null again, and the offer disappears when it does',
    );
  });

  it('subscriptionFor cannot answer null for a missing profile', () => {
    const source = readFileSync(path.join(import.meta.dirname, 'billing.ts'), 'utf8');
    assert.match(source, /if \(!data\) \{[\s\S]{0,200}planId: 'free'/);
  });
});
