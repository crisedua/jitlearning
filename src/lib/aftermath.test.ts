/**
 * Every gate between hanging up and seeing the class on /progreso.
 *
 * Third list of this kind. The offer had three gates and the classroom eight,
 * and in both cases each had been closed alone by somebody who had found one.
 * This path is the one that decides whether a class existed at all: a learner
 * who talks for twenty minutes and comes back to an empty notebook has been told
 * the product does not remember them, which is the single thing a teacher cannot
 * fail at.
 *
 * Six gates, and unlike the other two lists most of these fail by returning 200
 * to ElevenLabs. That is deliberate — a retried delivery that will never succeed
 * is worse than a dropped one — and it is also why nothing here is loud, and why
 * `/admin/estado` and the doctor both ask the database whether summaries are
 * actually arriving rather than trusting that the endpoint answered.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...p: string[]) => readFileSync(path.join(ROOT, ...p), 'utf8');

describe('the gates between a class ending and a learner seeing it', () => {
  const tutor = read('src', 'components', 'VoiceTutor.tsx');
  const hook = read('src', 'app', 'api', 'webhooks', 'elevenlabs', 'route.ts');
  const progress = read('src', 'lib', 'progress.ts');
  const account = read('src', 'lib', 'account.ts');

  it('1. the tab closes: the usage row is sent by a transport that survives it', () => {
    // `fetch` with keepalive is the modern answer and the one iOS honours least.
    // This request carries the conversation id the webhook matches on.
    assert.match(tutor, /navigator\.sendBeacon\?\.\(url, blob\)/);
  });

  it('2. the row is closed, or the failure is named', () => {
    assert.match(account, /session \$\{sessionId\} not closed: no row for that user/);
  });

  it('3. the webhook is unsigned or forged: refused, and told apart from unconfigured', () => {
    assert.match(hook, /status: 503/, 'a missing secret must not look like a bad signature');
    assert.match(hook, /Invalid signature\.[\s\S]{0,40}401/);
  });

  it('4. an unknown conversation is ignored with 200, not retried forever', () => {
    assert.match(hook, /ignored: 'unknown conversation'/);
  });

  it('5. each write reports landing nothing, rather than reporting nothing', () => {
    // An update whose filter matches no row is not an error. Every write on this
    // path asks for the count, because the alternative is a class that returns
    // 200 at both ends and records none of itself.
    for (const marker of [
      /step \$\{step\.id\} vanished between read and write/,
      /count: 'exact'/,
    ]) {
      assert.match(progress, marker);
    }
  });

  it('6. nothing arrived at all: the database is asked, not the configuration', () => {
    const delivery = read('src', 'lib', 'delivery.ts');
    assert.match(delivery, /coach_sessions/);
    assert.match(delivery, /session_summaries/);
    assert.match(
      delivery,
      /GRACE_MINUTES/,
      'without a grace window this cries wolf on the first class somebody has',
    );
  });
});
