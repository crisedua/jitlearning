/**
 * The two decisions that stand between a payment and a plan.
 *
 * Both are pure, and both are the kind of thing that is wrong in a way nothing
 * complains about: a signature check that accepts everything looks exactly like
 * one that works, and a status map that returns `free` for a paying customer
 * looks exactly like a customer who has not paid.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifySignature, planForStatus } from './mercadopago';

const SECRET = 'un-secreto-de-webhook';

/** A header built the way Mercado Pago builds one. */
function sign(dataId: string | null, requestId: string | null, ts = '1700000000'): string {
  let manifest = '';
  if (dataId) manifest += `id:${dataId.toLowerCase()};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;
  return `ts=${ts},v1=${createHmac('sha256', SECRET).update(manifest).digest('hex')}`;
}

describe('proving a notification came from Mercado Pago', () => {
  it('accepts a signature it built itself', () => {
    assert.equal(verifySignature(sign('123', 'req-1'), 'req-1', '123', SECRET), true);
  });

  it('rejects the same notification signed with another secret', () => {
    const other = `ts=1700000000,v1=${createHmac('sha256', 'otro').update('x').digest('hex')}`;
    assert.equal(verifySignature(other, 'req-1', '123', SECRET), false);
  });

  /*
   * The id arrives lowercased in the manifest and not in the payload, which is
   * the detail that makes a correct-looking implementation reject every real
   * notification whose id has a capital in it.
   */
  it('lowercases the id, as the platform does', () => {
    assert.equal(verifySignature(sign('ORD01ABC', 'req-1'), 'req-1', 'ORD01ABC', SECRET), true);
  });

  /*
   * A missing component is dropped from the manifest, not included as empty.
   * `request-id:;` and no `request-id` at all hash differently, and getting it
   * backwards rejects every notification that arrives without the header.
   */
  it('drops an absent request id instead of signing an empty one', () => {
    assert.equal(verifySignature(sign('123', null), null, '123', SECRET), true);
  });

  it('refuses a header that carries no signature', () => {
    for (const header of [null, '', 'ts=1700000000', 'v1=abc', 'basura']) {
      assert.equal(verifySignature(header, 'r', '1', SECRET), false, String(header));
    }
  });

  /*
   * With no secret configured this must fail closed. Returning true would turn
   * a missing environment variable into an open door that anybody who knows the
   * URL can set a plan through.
   */
  it('fails closed when no secret is configured', () => {
    assert.equal(verifySignature(sign('123', 'r'), 'r', '123', ''), false);
  });

  it('does not throw on a signature of the wrong length', () => {
    assert.equal(verifySignature('ts=1,v1=ab', 'r', '123', SECRET), false);
  });
});

describe('what a subscription state entitles somebody to', () => {
  it('gives the plan to an authorised subscription', () => {
    assert.equal(planForStatus('authorized', 'standard'), 'standard');
  });

  /*
   * `pending` is the tab-closing case: a subscription minted by our checkout
   * route and never approved. Treating it as paying is the paywall-as-suggestion
   * failure the whole module exists to avoid.
   */
  it('gives nothing to a subscription nobody approved', () => {
    assert.equal(planForStatus('pending', 'standard'), 'free');
  });

  it('takes the plan back when somebody stops', () => {
    for (const status of ['paused', 'cancelled']) {
      assert.equal(planForStatus(status, 'standard'), 'free', status);
    }
  });

  /*
   * Never null: `plan_id` is a non-null foreign key the gate reads on every
   * mint, so "no plan" is not a state this schema can hold.
   */
  it('always names a plan, even when it does not know one', () => {
    assert.equal(planForStatus('authorized', null), 'free');
    assert.equal(planForStatus('inventado', null), 'free');
  });
});
