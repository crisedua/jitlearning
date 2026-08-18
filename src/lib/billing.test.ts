/**
 * The money path, exercised.
 *
 * Two things are tested here and nothing else, because these are the two places
 * where a bug means somebody is charged and does not get what they paid for, or
 * somebody who did not pay gets it:
 *
 *   1. Webhook signature verification. This is pure crypto in Stripe's SDK, so it
 *      runs with no account, no network and no key beyond one made up here.
 *   2. The status-to-plan decision, which decides who keeps their minutes.
 *
 * No network, no database, no Stripe account: `npm test` passes on a clean clone.
 * That matters because the rest of the billing integration cannot be tested
 * without a live account, so the parts that *can* be should be, and the untested
 * remainder should be small enough to walk by hand with a test card.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Stripe from 'stripe';
import { isComped, planFor } from './billing';

/** Not a real key. `constructEvent` is local crypto and never calls Stripe. */
const SECRET = 'whsec_test_secret_for_local_verification_only';
const client = new Stripe('sk_test_not_a_real_key');

function payload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: 'evt_test_1',
    type: 'customer.subscription.updated',
    data: { object: { id: 'sub_1', status: 'active' } },
    ...overrides,
  });
}

describe('webhook signature verification', () => {
  it('accepts a payload signed with the right secret', () => {
    const body = payload();
    const header = client.webhooks.generateTestHeaderString({ payload: body, secret: SECRET });

    const event = client.webhooks.constructEvent(body, header, SECRET);
    assert.equal(event.id, 'evt_test_1');
    assert.equal(event.type, 'customer.subscription.updated');
  });

  it('rejects a payload signed with a different secret', () => {
    const body = payload();
    const header = client.webhooks.generateTestHeaderString({
      payload: body,
      secret: 'whsec_someone_elses_secret',
    });

    assert.throws(() => client.webhooks.constructEvent(body, header, SECRET));
  });

  it('rejects a body altered after signing', () => {
    // The exact attack the signature exists to stop: a valid header from a real
    // event, replayed with the amount or the plan swapped.
    const body = payload();
    const header = client.webhooks.generateTestHeaderString({ payload: body, secret: SECRET });
    const tampered = body.replace('"status":"active"', '"status":"trialing"');

    assert.notEqual(tampered, body);
    assert.throws(() => client.webhooks.constructEvent(tampered, header, SECRET));
  });

  it('rejects a stale signature outside the tolerance', () => {
    const body = payload();
    const header = client.webhooks.generateTestHeaderString({
      payload: body,
      secret: SECRET,
      timestamp: Math.floor(Date.now() / 1000) - 60 * 60,
    });

    // 300s is Stripe's own default tolerance. An hour-old header is a replay.
    assert.throws(() => client.webhooks.constructEvent(body, header, SECRET, 300));
  });

  it('rejects a missing signature header', () => {
    assert.throws(() => client.webhooks.constructEvent(payload(), '', SECRET));
  });
});

describe('which plan a subscription entitles you to', () => {
  it('grants the plan while active or trialing', () => {
    assert.equal(planFor('active', 'founder'), 'founder');
    assert.equal(planFor('trialing', 'standard'), 'standard');
  });

  it('keeps the plan through past_due, because a failed retry is not a cancellation', () => {
    assert.equal(planFor('past_due', 'founder'), 'founder');
  });

  it('drops to free once the subscription is really over', () => {
    for (const status of ['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused']) {
      assert.equal(planFor(status, 'founder'), 'free', status);
    }
  });

  it('drops to free when the price maps to no plan we sell', () => {
    // A price created in Stripe by hand, or a plan retired here but still billing.
    // Granting "whatever that was" would be worse than granting nothing.
    assert.equal(planFor('active', null), 'free');
  });
});

/*
 * Who is on a courtesy plan, and who paid for one.
 *
 * The page decided this from "has no Stripe customer", which is true of every
 * early customer this product will have: checkout is not configured, so a sale
 * happens over WhatsApp and the plan is set by hand. Those people were shown
 * "Fundador · de cortesía" and told there was nothing to pay or cancel, minutes
 * after paying.
 *
 * The distinction is worth a function because the two look identical in the
 * database except for one column, and getting it backwards is only visible to
 * the person it insults.
 */
describe('a courtesy plan against a bought one', () => {
  const sub = (grantedUntil: string | null) => ({ grantedUntil });

  it('is a courtesy when we set an end date, which only grantPlan does', () => {
    assert.equal(isComped(sub('2026-11-18T00:00:00.000Z')), true);
  });

  it('is not a courtesy for somebody who paid a person', () => {
    // No Stripe customer, no end date: sold over WhatsApp, plan set by hand.
    // The old rule called this comped and told them not to bother cancelling.
    assert.equal(isComped(sub(null)), false);
  });

  it('is not a courtesy for a normal Stripe subscriber either', () => {
    assert.equal(isComped(sub(null)), false);
  });
});
