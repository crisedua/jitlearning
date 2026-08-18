/**
 * "Configured" has to mean "a client can be built".
 *
 * `createClient` throws from its constructor on a URL with no scheme, and about
 * twenty places in this codebase are written as `if (!serviceConfigured())
 * return <something harmless>`. Every one of them reads that guard as "safe to
 * build a client". If the guard answers on presence alone, they all raise
 * instead of degrading, and the sharpest version is `/auth/callback`, where a
 * successful Google sign-in ends in a 500 because a profile mirror threw.
 *
 * The mistake is not exotic: it is a project URL pasted without `https://`,
 * which is the ordinary way that value gets copied out of a dashboard.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { authConfigured, serviceConfigured } from './env';

const KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function set(url: string | undefined) {
  if (url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
}

describe('configuration means usable, not present', () => {
  it('accepts a real project URL', () => {
    set('https://kmreloatvnnlieydlfuq.supabase.co');
    assert.equal(authConfigured(), true);
    assert.equal(serviceConfigured(), true);
  });

  it('rejects the scheme-less paste, which is the whole point', () => {
    set('kmreloatvnnlieydlfuq.supabase.co');
    assert.equal(authConfigured(), false, 'createClient would throw on this');
    assert.equal(serviceConfigured(), false);
  });

  it('rejects blank, whitespace and nonsense', () => {
    for (const bad of [undefined, '', '   ', 'not a url', 'ftp://example.com']) {
      set(bad);
      assert.equal(authConfigured(), false, `accepted ${JSON.stringify(bad)}`);
      assert.equal(serviceConfigured(), false, `accepted ${JSON.stringify(bad)}`);
    }
  });

  it('still requires the keys, not just the URL', () => {
    set('https://example.supabase.co');
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    assert.equal(authConfigured(), false);
    assert.equal(serviceConfigured(), true, 'the service key is a separate question');

    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.equal(serviceConfigured(), false);
  });
});
