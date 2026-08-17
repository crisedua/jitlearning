/**
 * Promises the site makes that the app has to be able to keep.
 *
 * The feedback deal has already been wrong once in exactly this way: it offered
 * three months of "Esencial" after that plan had been unpublished in a migration
 * two passes earlier. Nothing failed. The page rendered, the form worked, and the
 * only way to find out was for somebody to try to claim it — which, since this
 * deal is how the first ten people are recruited, means finding out from the
 * person you least want to disappoint.
 *
 * A plan name in prose is not checkable. A plan id is, so the deal now carries
 * one and this pins it.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FEEDBACK_DEAL, FEEDBACK_REWARD } from './site';
import { FALLBACK_PLANS } from './plans';
import { seatsLeft, FEEDBACK_REASON, type Grant } from './grants';

describe('the feedback deal', () => {
  it('names a plan that exists', () => {
    const plan = FALLBACK_PLANS.find((p) => p.id === FEEDBACK_REWARD.planId);
    assert.ok(plan, `no plan with id "${FEEDBACK_REWARD.planId}"`);
  });

  it('names a plan somebody could actually be put on', () => {
    const plan = FALLBACK_PLANS.find((p) => p.id === FEEDBACK_REWARD.planId)!;
    assert.equal(plan.isPublic, true, `${plan.id} is not public, so the deal cannot be honoured`);
  });

  it('shows the same plan name it grants', () => {
    // The prose and the id are two records of one fact. This is the join.
    const plan = FALLBACK_PLANS.find((p) => p.id === FEEDBACK_REWARD.planId)!;
    assert.equal(plan.name, FEEDBACK_REWARD.plan);
  });

  it('the sentence on the page says what the code does', () => {
    assert.ok(FEEDBACK_DEAL.includes(String(FEEDBACK_REWARD.months)), FEEDBACK_DEAL);
    assert.ok(FEEDBACK_DEAL.includes(FEEDBACK_REWARD.plan), FEEDBACK_DEAL);
    assert.ok(FEEDBACK_DEAL.includes(String(FEEDBACK_REWARD.seats)), FEEDBACK_DEAL);
  });
});

describe('counting the seats the site advertises', () => {
  const grant = (over: Partial<Grant> = {}): Grant => ({
    userId: `u${Math.round(1)}`,
    email: null,
    planId: 'founder',
    until: '2099-01-01T00:00:00Z',
    reason: FEEDBACK_REASON,
    expired: false,
    ...over,
  });

  it('starts at the advertised number', () => {
    assert.equal(seatsLeft([]), FEEDBACK_REWARD.seats);
  });

  it('counts an expired grant as a seat still taken', () => {
    // The seat was given. That the three months ran out does not hand it back,
    // and pretending otherwise would let the eleventh person be told they were
    // among the first ten.
    const used = seatsLeft([grant({ expired: true })]);
    assert.equal(used, FEEDBACK_REWARD.seats - 1);
  });

  it('ignores grants made for some other reason', () => {
    assert.equal(seatsLeft([grant({ reason: 'comped-manually' })]), FEEDBACK_REWARD.seats);
  });

  it('never goes below zero', () => {
    const many = Array.from({ length: FEEDBACK_REWARD.seats + 3 }, () => grant());
    assert.equal(seatsLeft(many), 0);
  });
});
