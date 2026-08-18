/**
 * The order a deployment becomes usable in, and the fact that both surfaces
 * agree about it.
 *
 * `npm run doctor` and `/admin/estado` both answer "what should I do first",
 * and each had grown its own copy of this ladder, written days apart. A ladder
 * in two places disagrees with itself the first time a rung moves, and the
 * disagreement is invisible: both keep answering confidently, with different
 * answers, to the same person.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { firstMissingRung, SETUP_ORDER } from './setup';

const ROOT = path.join(import.meta.dirname, '..', '..');

describe('the setup ladder', () => {
  it('asks for sign-in before anything else', () => {
    // Not taste: without it nobody reaches a page that needs an account, so a
    // fix to any later rung changes nothing anybody can observe.
    assert.equal(SETUP_ORDER[0]!.id, 'signin');
    assert.equal(SETUP_ORDER.at(-1)!.id, 'money');
  });

  it('walks down one rung at a time as each is satisfied', () => {
    const all = SETUP_ORDER.flatMap((r) => r.vars);
    const seen: string[] = [];

    for (let i = 0; i <= all.length; i++) {
      const have = new Set(all.slice(0, i));
      const rung = firstMissingRung((name) => have.has(name));
      if (rung) seen.push(rung.id);
      else assert.equal(i, all.length, 'nothing missing before every variable is set');
    }

    // Every rung is asked for, in order, and none is skipped.
    assert.deepEqual([...new Set(seen)], SETUP_ORDER.map((r) => r.id));
  });

  it('selects a rung when any one of its variables is missing', () => {
    const rung = firstMissingRung((name) => name !== 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
    assert.equal(rung?.id, 'signin', 'one missing variable is enough to select the rung');
  });

  it('says nothing when everything is set', () => {
    assert.equal(firstMissingRung(() => true), null);
  });

  /*
   * The reason this module exists. Both surfaces must carry a sentence for every
   * rung, or a deployment reaches a state where the page that is meant to say
   * what to do next says nothing at all.
   */
  it('is worded for every rung on both surfaces', () => {
    const sources = [
      readFileSync(path.join(ROOT, 'scripts', 'doctor.ts'), 'utf8'),
      readFileSync(path.join(ROOT, 'src', 'app', 'admin', 'estado', 'page.tsx'), 'utf8'),
    ];
    for (const source of sources) {
      for (const rung of SETUP_ORDER) {
        assert.match(source, new RegExp(`\\b${rung.id}:`), `no copy for the "${rung.id}" rung`);
      }
    }
  });
});

/*
 * Both surfaces have to be able to name every success criterion.
 *
 * The doctor and /admin/embudo each report the four verdicts a class comes back
 * with, in English and in Spanish. They derive the ids from
 * `evaluationCriteria()` so a fifth criterion cannot leave one of them
 * reporting three of four, but the wording is local to each — and a criterion
 * with no wording falls back to its id, which is a prompt written for an
 * evaluator and reads as noise on a dashboard.
 */
describe('the success criteria have wording on both surfaces', () => {
  it('names every criterion in English and in Spanish', async () => {
    const { evaluationCriteria } = await import('./agent');
    const sources = [
      readFileSync(path.join(ROOT, 'scripts', 'doctor.ts'), 'utf8'),
      readFileSync(path.join(ROOT, 'src', 'app', 'admin', 'embudo', 'page.tsx'), 'utf8'),
    ];
    for (const source of sources) {
      for (const criterion of evaluationCriteria()) {
        assert.match(
          source,
          new RegExp(`${criterion.id}:`),
          `no label for "${criterion.id}", so it would print its own prompt id`,
        );
      }
    }
  });
});
