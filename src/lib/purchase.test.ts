/**
 * Every gate between deciding to pay and having the plan.
 *
 * Fourth and last list of this kind. The offer had three gates, the classroom
 * eight, the aftermath six. This one decides whether the product is a business,
 * and it is the path where a silent failure costs the most: somebody has handed
 * over money and received nothing, and the only person who knows is them.
 *
 * Ten gates. Three of them exist to degrade gracefully while Stripe is
 * unconfigured, which is the state this deployment is in and the state every
 * early sale will happen in, so they are as real as the rest.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...p: string[]) => readFileSync(path.join(ROOT, ...p), 'utf8');

describe('the gates between wanting to pay and having a plan', () => {
  const planes = read('src', 'app', 'planes', 'page.tsx');
  const progreso = read('src', 'app', 'progreso', 'page.tsx');
  const checkout = read('src', 'app', 'api', 'checkout', 'route.ts');
  const hook = read('src', 'app', 'api', 'webhooks', 'stripe', 'route.ts');
  const billing = read('src', 'lib', 'billing.ts');

  it('1. no Stripe: /planes writes to a person instead of a dead button', () => {
    assert.match(planes, /if \(buyable\) \{/);
    assert.match(planes, /IntentLink/, 'the fallback no longer records that somebody tried');
  });

  it('2. no Stripe: the offer under the hours does the same', () => {
    assert.match(progreso, /buyable \? \(/);
    assert.match(progreso, /channel="whatsapp"/);
  });

  it('3. no Stripe: somebody already paying is told how to reach a person', () => {
    assert.match(progreso, /billingConfigured\(\) \? \(\s*<BillingLink/);
  });

  it('4. not signed in: refused before a session is minted', () => {
    assert.match(checkout, /status: 401/);
  });

  it('5. a tampered plan: the price comes from the server, never the request', () => {
    assert.match(checkout, /purchasablePlan/);
    assert.doesNotMatch(checkout, /body\.(price|amount)/, 'a price from the request would be chargeable');
  });

  it('6. no profile row: refused loudly, because the webhook matches on it later', () => {
    assert.match(billing, /could not attach customer/);
  });

  it('7. an unsigned webhook is refused', () => {
    assert.match(hook, /Missing stripe-signature/);
    assert.match(hook, /Invalid signature/);
  });

  it('8. a redelivery is claimed once, and claimed is not handled', () => {
    assert.match(hook, /claimEvent\(event\)/);
    assert.match(billing, /handled_at/);
  });

  it('9. the plan write matching no row fails the delivery, so Stripe retries', () => {
    // The comment in `applySubscription` says a webhook that cannot write must
    // return non-2xx or somebody has paid for nothing. A zero-row update is that
    // case and used to return cleanly.
    assert.match(billing, /No profile for customer/);
    assert.match(hook, /status: 500/, 'a failed handler no longer asks Stripe to retry');
  });

  it('10. a paid customer is never labelled a courtesy', () => {
    assert.match(billing, /export function isComped/);
    assert.match(progreso, /isComped\(subscription\)/);
  });
});
