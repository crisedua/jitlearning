/**
 * Which hostname this app is willing to be served from.
 *
 * The redirect this feeds exists because the app answers on a custom domain and
 * on the `.vercel.app` alias, Supabase allow-lists OAuth redirect URLs one at a
 * time, and a sign-in begun on the wrong one cannot be completed on the other:
 * the PKCE verifier is a cookie and cookies do not travel. Which link somebody
 * was sent decided whether they could sign in at all.
 *
 * It was written to wait on an environment variable, which meant it protected
 * nobody until somebody set one. It falls back to the origin this repo already
 * declares for the search tool.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { DEFAULT_ORIGIN, canonicalHost, configuredOrigin } from './canonical';

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe('the canonical origin', () => {
  it('is the configured one when there is one', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://ejemplo.cl';
    assert.equal(configuredOrigin(), 'https://ejemplo.cl');
    assert.equal(canonicalHost(), 'ejemplo.cl');
  });

  it('accepts the older alias for the same setting', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.PUBLIC_BASE_URL = 'https://otro.cl';
    assert.equal(canonicalHost(), 'otro.cl');
  });

  it('keeps only the origin, so a stray path cannot leak into generated URLs', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://ejemplo.cl/app/';
    assert.equal(configuredOrigin(), 'https://ejemplo.cl');
  });

  it('falls back to the declared origin rather than to nothing', () => {
    // The whole point: unset used to mean no redirect, which means the alias
    // keeps serving and sign-in stays a coin flip.
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.PUBLIC_BASE_URL;
    assert.equal(configuredOrigin(), null);
    assert.equal(canonicalHost(), new URL(DEFAULT_ORIGIN).host);
  });

  it('ignores a value that is not a URL instead of throwing', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'modojit.com';
    assert.equal(configuredOrigin(), null);
  });
});
