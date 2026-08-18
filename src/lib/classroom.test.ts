/**
 * Every gate between pressing the button and a class starting.
 *
 * The offer on `/progreso` turned out to have three of these, each closed alone
 * by somebody who had found one, and the room had three. This is the same list
 * for the screen that matters more: `/coach` is where the product either works
 * or does not, and a learner who gets nothing there does not come back to find
 * out why.
 *
 * The rule for all of them is the same and is the only thing worth testing
 * without a browser: a gate may refuse, and it may not refuse silently or in a
 * language the reader does not speak. Each is checked at its source rather than
 * by rendering, because rendering needs a session, a microphone and a socket.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...p: string[]) => readFileSync(path.join(ROOT, ...p), 'utf8');

describe('the gates between a learner and a class', () => {
  const signedUrl = read('src', 'app', 'api', 'signed-url', 'route.ts');
  const tutor = read('src', 'components', 'VoiceTutor.tsx');
  const coach = read('src', 'app', 'coach', 'page.tsx');
  const layout = read('src', 'app', 'coach', 'layout.tsx');

  it('1. not signed in: redirected before anything renders', () => {
    // In the layout rather than the page, so it happens outside the Suspense
    // boundary `loading.tsx` creates and arrives as a 307 instead of a skeleton.
    assert.match(layout, /redirect\(signInPath\('\/coach'\)\)/);
  });

  it('2. no agent configured: a sentence, and the detail only for an operator', () => {
    assert.match(coach, /isOperator/, 'the page no longer distinguishes who is reading');
    assert.match(coach, /La clase no está disponible ahora mismo/);
  });

  it('3. session expired mid-page: sent back through Google, not shown an error', () => {
    assert.match(
      tutor,
      /res\.status === 401[\s\S]{0,200}auth\/login/,
      'an expired session no longer sends the learner to sign in again',
    );
  });

  it('4. out of minutes: told which limit, and offered the way out', () => {
    assert.match(signedUrl, /status: 403/);
    assert.match(signedUrl, /allowance\.error/, 'the gate no longer passes its own message through');
  });

  it('5. the mint fails: a learner-facing sentence, never the internal reason', () => {
    assert.match(signedUrl, /NOT_AVAILABLE/);
    assert.doesNotMatch(
      signedUrl,
      /error: (err|String\(err\))/,
      'the raw failure reaches the learner instead of a sentence written for them',
    );
  });

  it('6. microphone refused: said in Spanish, with where to fix it', () => {
    assert.match(tutor, /micMessage\(err\)/);
  });

  it('7. the record cannot be read: the class starts cold rather than not at all', () => {
    const progress = read('src', 'lib', 'progress.ts');
    assert.match(progress, /learner record failed, opening cold/);
  });

  it('8. the class breaks mid-sentence: told what to do, not what broke', () => {
    assert.match(tutor, /liveCallMessage\(message\)/);
  });
});
