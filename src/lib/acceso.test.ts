/**
 * Every sign-in failure has a sentence written for it.
 *
 * `/acceso` maps an error code to Spanish and falls through to a generic line
 * for anything it does not recognise. The fall-through is deliberate — it is
 * what stops a raw provider string from reaching a learner — and it also means a
 * code nobody wrote an entry for degrades silently into "no se pudo completar
 * el inicio de sesión", which is true, unhelpful, and identical for every cause.
 *
 * These routes are the only things that produce those codes. Nothing else
 * connects the two files, so a new failure branch would ship with a generic
 * message and read as correct in review.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();

/** The codes the ERRORS table in /acceso has a sentence for. */
function known(): Set<string> {
  const source = readFileSync(path.join(ROOT, 'src', 'app', 'acceso', 'page.tsx'), 'utf8');
  const table = /const ERRORS: Record<string, string> = \{([\s\S]*?)\n\};/.exec(source);
  assert.ok(table, 'could not find the ERRORS table in /acceso');
  return new Set([...table[1]!.matchAll(/^\s{2}([a-z_]+):/gm)].map((m) => m[1]!));
}

/** Every `?error=` code any route redirects to /acceso with. */
function emitted(): { code: string; file: string }[] {
  const files = [
    path.join('src', 'app', 'auth', 'callback', 'route.ts'),
    path.join('src', 'app', 'auth', 'login', 'route.ts'),
  ];

  const found: { code: string; file: string }[] = [];
  for (const rel of files) {
    let source: string;
    try {
      source = readFileSync(path.join(ROOT, rel), 'utf8');
    } catch {
      continue;
    }
    for (const m of source.matchAll(/acceso\?error=([a-z_]+)/g)) {
      found.push({ code: m[1]!, file: rel });
    }
  }
  return found;
}

describe('sign-in failures the learner can read', () => {
  const table = known();
  const codes = emitted();

  it('found both halves, so the checks below mean something', () => {
    assert.ok(table.size >= 4, `only ${table.size} entries in the ERRORS table`);
    assert.ok(codes.length >= 3, `only ${codes.length} error redirects found`);
  });

  for (const { code, file } of codes) {
    it(`${code} has its own sentence (${file})`, () => {
      assert.ok(
        table.has(code),
        `${file} redirects with "${code}" and /acceso has no entry for it, so the ` +
          `learner gets the generic message and never learns which failure it was`,
      );
    });
  }

  it('never puts a raw error message in the URL', () => {
    // The provider's own string used to be forwarded as the code. It matched no
    // entry, so the display was right, and it rode along in the address bar
    // while the server kept no record of it: the learner held the detail and
    // could not use it, the operator could and did not have it.
    const source = readFileSync(
      path.join(ROOT, 'src', 'app', 'auth', 'callback', 'route.ts'),
      'utf8',
    );
    assert.ok(
      !/acceso\?error=\$\{encodeURIComponent/.test(source),
      'the callback is interpolating an error message into the redirect again',
    );
  });
});
