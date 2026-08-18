/**
 * The ceiling on somebody else's service.
 *
 * Used in the two places where waiting is not an option: before the microphone
 * opens, and inside the page that exists to report what is broken. Both failed
 * the same way before it — not with an error, which produces a sentence, but by
 * hanging, which produces a dead button and a page that never loads.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { withDeadline } from './deadline';

const after = <T>(ms: number, value: T) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

describe('waiting only so long', () => {
  it('returns the real answer when it arrives in time', async () => {
    assert.equal(await withDeadline(after(10, 'real'), 'fallback', 200), 'real');
  });

  it('gives up and returns the fallback when it does not', async () => {
    const started = Date.now();
    assert.equal(await withDeadline(after(5_000, 'real'), 'fallback', 120), 'fallback');
    // Released on the deadline rather than on the work: the point is the caller
    // gets control back, not that the request was cancelled.
    assert.ok(Date.now() - started < 1_000, 'did not release on the deadline');
  });

  it('passes null through as a legitimate fallback', async () => {
    // The memory lookup's fallback is null, which means "start cold". A helper
    // that treated null as absent would make that case wait forever.
    assert.equal(await withDeadline(after(5_000, 'real'), null, 60), null);
  });

  it('lets a rejection reject rather than swallowing it', async () => {
    // A failing lookup is not a slow one. The callers handle their own errors,
    // and hiding one here would turn a broken key into a cold start nobody
    // could explain.
    await assert.rejects(
      withDeadline(Promise.reject(new Error('nope')), 'fallback', 200),
      /nope/,
    );
  });
});
