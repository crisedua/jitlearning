/**
 * The check that would have saved $920 a year.
 *
 * The account sat on ElevenLabs Pro — $99 a month, 1,238 included minutes —
 * against a busiest month of 226. Creator serves that for $22. Nothing was
 * broken and nothing reported anything, because an over-provisioned
 * subscription is not a fault: every request succeeded, every check stayed
 * green, and the only symptom was the invoice.
 *
 * `tierAdvice` is the missing question, and the cases below are the states the
 * account has actually been in or can reach.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ELEVENLABS_TIERS,
  TIER_ADVICE_FLOOR,
  elevenLabsCost,
  tierAdvice,
} from './costs';

/** The published overage rate, identical on every tier. */
const OVERAGE = 0.08;

describe('the ElevenLabs ladder has no volume discount', () => {
  /*
   * The structural fact the advice rests on, pinned because it is the reason a
   * bigger tier is never worth pre-buying: every commercial tier is priced at
   * exactly the overage rate times its own included minutes. If ElevenLabs ever
   * introduces a real discount, this fails and the advice needs rethinking
   * rather than quietly recommending the wrong tier.
   */
  for (const tier of ELEVENLABS_TIERS.filter((t) => t.commercial)) {
    it(`${tier.name} costs its included minutes at the overage rate`, () => {
      const implied = tier.includedMinutes * OVERAGE;
      assert.ok(
        Math.abs(implied - tier.monthly) < 1,
        `${tier.name}: $${tier.monthly} buys ${tier.includedMinutes} min, ` +
          `which at $${OVERAGE}/min is $${implied.toFixed(2)}`,
      );
    });
  }
});

describe('tierAdvice', () => {
  it('names the saving on the month this was found in', () => {
    // August 2026: 226 minutes of real classes, billed on Pro.
    const advice = tierAdvice('pro', 226, OVERAGE);

    assert.equal(advice.current?.id, 'pro');
    assert.equal(advice.currentTotal, 99);
    /*
     * Starter, not Creator. Cheapest is cheapest: $6 plus 151 overage minutes
     * is $18.08 against Creator's $22. The extra $3.92 buys no overage line and
     * 10 simultaneous conversations instead of 6, which is a judgement for
     * whoever reads this — the function's job is the arithmetic, and hiding the
     * true minimum inside it would be making that judgement for them.
     */
    assert.equal(advice.best.id, 'starter');
    assert.ok(Math.abs(advice.bestTotal - 18.08) < 0.01, `${advice.bestTotal}`);
    assert.ok(Math.abs(advice.saving - 80.92) < 0.01, `${advice.saving}`);
    assert.equal(advice.worthMoving, true);
    // 20 concurrent down to 6 is what the money is being traded for.
    assert.equal(advice.concurrencyChange, -14);
  });

  it('says nothing when the subscription already fits', () => {
    const advice = tierAdvice('starter', 226, OVERAGE);
    assert.equal(advice.saving, 0);
    assert.equal(advice.worthMoving, false);
  });

  /*
   * Past a tier's allowance, staying put and paying overage is usually right —
   * the ladder being linear is exactly what makes that true — so the advice
   * must not push an upgrade the moment overage appears.
   */
  it('does not push an upgrade just because overage started', () => {
    const advice = tierAdvice('creator', 400, OVERAGE);
    assert.equal(advice.current?.id, 'creator');
    assert.equal(advice.worthMoving, false, 'Creator plus overage is still cheapest at 400 min');
  });

  /*
   * The consequence of the ladder being linear, and the reason this advice only
   * ever points downward.
   *
   * Swept across every commercial tier and every minute count up to 6,000, the
   * most an upgrade can save is four cents. So a bigger tier is never a price
   * decision — it buys concurrency and nothing else, and any surface that
   * suggests upgrading to save money is wrong by construction.
   *
   * If ElevenLabs ever introduces a real volume discount this fails, which is
   * the point: the advice would then need to recommend upgrades too.
   */
  it('never recommends moving up to save money, because it cannot', () => {
    let most = 0;
    for (const from of ELEVENLABS_TIERS.filter((t) => t.commercial)) {
      for (let minutes = 0; minutes <= 6_000; minutes += 10) {
        const advice = tierAdvice(from.id, minutes, OVERAGE);
        if (advice.best.concurrency > from.concurrency) most = Math.max(most, advice.saving);
      }
    }
    assert.ok(most < 1, `an upgrade saves up to $${most.toFixed(2)}, so the ladder is not linear`);
  });

  it('stays quiet about small change', () => {
    /*
     * Starter beats Creator by $16 at zero minutes, which is real; the floor is
     * what stops the same advice being given over a four dollar difference in a
     * quiet month, when acting on it costs a downgrade and a tighter ceiling.
     */
    const tiny = ELEVENLABS_TIERS.find((t) => t.id === 'starter')!;
    const minutes = tiny.includedMinutes;
    const advice = tierAdvice('creator', minutes, OVERAGE);
    const gap = elevenLabsCost(minutes, OVERAGE, 'creator').total - advice.bestTotal;
    assert.equal(advice.worthMoving, gap >= TIER_ADVICE_FLOOR);
  });

  it('flags the free tier as a licence problem, not a bargain', () => {
    const advice = tierAdvice('free', 10, OVERAGE);
    assert.equal(advice.nonCommercial, true);
  });

  it('still answers when the tier name is unrecognised', () => {
    // A new ElevenLabs plan name must not take the page down; it just means the
    // comparison cannot be made, while the recommendation still can.
    const advice = tierAdvice('enterprise-custom', 500, OVERAGE);
    assert.equal(advice.current, null);
    assert.equal(advice.currentTotal, null);
    assert.equal(advice.worthMoving, false);
    assert.ok(advice.best.id, 'a best tier is still named');
  });
});
