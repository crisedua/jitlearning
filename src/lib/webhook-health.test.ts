/**
 * The check that would have caught it on day one.
 *
 * Every case below is a state this deployment has actually been in. The one
 * that matters is `wrong secret`: set, present, reported green by the old check,
 * and refused by our own route on every delivery for nine days.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RECENT_FAILURE_SECONDS, postCallWebhookVerdict } from './webhook-health';
import type { WorkspaceWebhook } from './elevenlabs';

const NOW = 1_787_800_000;

const hook = (over: Partial<WorkspaceWebhook> = {}): WorkspaceWebhook => ({
  webhook_id: 'hook_1',
  name: 'ModoJIT post-call',
  webhook_url: 'https://www.modojit.com/api/webhooks/elevenlabs',
  is_disabled: false,
  is_auto_disabled: false,
  most_recent_failure_error_code: null,
  most_recent_failure_timestamp: null,
  ...over,
});

type Input = Parameters<typeof postCallWebhookVerdict>[0];

const verdict = (over: Partial<Input> = {}) =>
  postCallWebhookVerdict({
    secretSet: true,
    asked: true,
    postCallId: 'hook_1',
    hook: hook(),
    nowSeconds: NOW,
    ...over,
  });

describe('the post-call webhook verdict', () => {
  it('passes when it is registered, enabled and landing', () => {
    assert.equal(verdict().state, 'ok');
  });

  it('fails on a missing secret, without asking anybody', () => {
    const v = verdict({ secretSet: false, asked: false, postCallId: null, hook: null });
    assert.equal(v.state, 'fail');
    assert.match(v.detail, /503/);
  });

  /*
   * The nine days. Set, present, and not the secret ElevenLabs signs with.
   *
   * The old check reported `ok` for exactly this input, which is the whole
   * reason this file exists — so the assertion is on the state *and* on the
   * detail naming the fix, because "something is wrong with the webhook" would
   * have sent somebody to the ElevenLabs dashboard to re-register a webhook
   * that was registered correctly the entire time.
   */
  it('fails on a wrong secret, which presence could never see', () => {
    const v = verdict({
      hook: hook({
        is_disabled: true,
        is_auto_disabled: true,
        most_recent_failure_error_code: 401,
        most_recent_failure_timestamp: NOW - 3 * 24 * 60 * 60,
      }),
    });
    assert.equal(v.state, 'fail');
    assert.match(v.detail, /auto-disabled/);
    assert.match(v.detail, /ELEVENLABS_WEBHOOK_SECRET in this deployment is not the secret/);
    assert.match(v.detail, /Vercel/);
  });

  it('fails while it is still enabled, if the last delivery failed', () => {
    const v = verdict({
      hook: hook({
        most_recent_failure_error_code: 401,
        most_recent_failure_timestamp: NOW - 60,
      }),
    });
    assert.equal(v.state, 'fail');
    assert.match(v.detail, /not coming back/);
  });

  it('forgets a failure once a day has passed with none since', () => {
    const v = verdict({
      hook: hook({
        most_recent_failure_error_code: 500,
        most_recent_failure_timestamp: NOW - RECENT_FAILURE_SECONDS - 1,
      }),
    });
    assert.equal(v.state, 'ok');
  });

  it('reads a 503 as the secret never having reached the deployment', () => {
    const v = verdict({
      hook: hook({ is_disabled: true, most_recent_failure_error_code: 503 }),
    });
    assert.match(v.detail, /ELEVENLABS_WEBHOOK_SECRET was missing from the deployment/);
  });

  it('fails when nothing is registered at all', () => {
    const v = verdict({ postCallId: null, hook: null });
    assert.equal(v.state, 'fail');
    assert.match(v.detail, /setup:webhook/);
  });

  it('fails when the registered id names a webhook that does not exist', () => {
    const v = verdict({ hook: null });
    assert.equal(v.state, 'fail');
    assert.match(v.detail, /hook_1/);
  });

  /*
   * Skipped, not failed. A deployment with no API key is already red for that,
   * and reporting a second fault invents one out of the same missing key.
   */
  it('skips when ElevenLabs could not be asked', () => {
    const v = verdict({ asked: false, postCallId: null, hook: null });
    assert.equal(v.state, 'skipped');
  });
});
