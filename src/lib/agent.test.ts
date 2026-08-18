/**
 * The two contracts between this app and ElevenLabs that no compiler covers.
 *
 * Both fail the same way the level-name constraint did: silently, and completely.
 *
 * **Extraction fields.** `dataCollection()` declares what ElevenLabs should pull
 * out of a transcript; `progress.ts` reads those results back by string name.
 * Rename one on either side and the reader gets null forever — no error, no log,
 * just a profile that never fills in and hours that are never measured.
 *
 * **Dynamic variables.** The persona interpolates `{{registro}}` and
 * `{{primera_sesion}}`, and the first message is `{{apertura}}`. A conversation
 * started without every referenced variable fails outright, so a renamed key in
 * `learnerRecord()` does not degrade the session, it ends it before the first
 * word.
 *
 * `npm run doctor` checks the live agent has the placeholders. These check the
 * repository agrees with itself, which is the half that can be verified without
 * an API key.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  dataCollection,
  dynamicVariablePlaceholders,
  FIRST_MESSAGE,
  teacherSystemPrompt,
} from './agent';

/** Field names `progress.ts` and `commitments.ts` actually look up. */
function fieldsReadBack(): Set<string> {
  const src =
    readFileSync('src/lib/progress.ts', 'utf8') + readFileSync('src/lib/commitments.ts', 'utf8');
  return new Set(
    [...src.matchAll(/(?:field|list|minutes)\(\s*(?:analysis|conversation)\s*,\s*'([^']+)'/g)].map(
      (m) => m[1]!,
    ),
  );
}

describe('extraction fields', () => {
  it('the source scan found something, so the check below means something', () => {
    /*
     * The scan is a regex over two files. If it stopped matching — a helper
     * renamed, the call sites refactored — it would return nothing and the test
     * beneath this one would iterate an empty set and pass. That exact failure
     * has already happened once in this repo, in a guard that silently checked
     * two of three messages and reported success.
     */
    assert.ok(
      fieldsReadBack().size >= 10,
      `only ${fieldsReadBack().size} extraction reads found; the scan has stopped matching`,
    );
  });

  it('every field read back is declared on the agent', () => {
    const declared = new Set(Object.keys(dataCollection()));
    for (const name of fieldsReadBack()) {
      assert.ok(
        declared.has(name),
        `'${name}' is read but never declared, so it is always null. Add it to dataCollection().`,
      );
    }
  });

  it('every field declared is read back somewhere', () => {
    // Not pedantry: ElevenLabs runs an extraction per field on every finished
    // call, so a declared-and-unread field is work paid for and discarded.
    const read = fieldsReadBack();
    for (const name of Object.keys(dataCollection())) {
      assert.ok(read.has(name), `'${name}' is extracted on every call and never read.`);
    }
  });
});

describe('dynamic variables', () => {
  it('the prompt and the first message actually use the variables', () => {
    /*
     * The check below only inspects the `{{...}}` the prompt happens to contain,
     * so a prompt that had lost them all would satisfy it by having nothing to
     * inspect. The failure that guards against is not hypothetical: this persona
     * has a hard character budget and has been trimmed several times, and losing
     * `{{registro}}` in a trim would mean every session starts cold — no plan, no
     * commitment, no continuity — with nothing failing anywhere.
     *
     * `{{apertura}}` is not in the prompt at all. It is the agent's
     * `first_message`, which is what makes the spoken opening the one composed
     * from the record.
     */
    for (const search of [true, false]) {
      const persona = teacherSystemPrompt({ search });
      const which = search ? 'searching' : 'no-search';
      assert.ok(persona.includes('{{registro}}'), `the ${which} prompt no longer injects the record`);
      assert.ok(
        persona.includes('{{primera_sesion}}'),
        `the ${which} prompt no longer knows whether this is a first session`,
      );
    }
    assert.equal(FIRST_MESSAGE, '{{apertura}}');
  });

  it('the persona references only variables the agent declares defaults for', () => {
    const declared = new Set(Object.keys(dynamicVariablePlaceholders()));

    /*
     * Both forms, because the persona has two.
     *
     * The searching variant is the one every check here used to read, and the
     * agent is currently running the other. A variable is not something the
     * substitutions touch today, which is exactly the position the session
     * shape was in before an edit could have taken a marker out of one form
     * only. The cost of asking both is a loop.
     */
    for (const search of [true, false]) {
      const persona = teacherSystemPrompt({ search });
      for (const m of persona.matchAll(/\{\{(\w+)\}\}/g)) {
        assert.ok(
          declared.has(m[1]!),
          `the ${search ? 'searching' : 'no-search'} prompt uses {{${m[1]}}} with no placeholder. A conversation that does not supply it fails outright.`,
        );
      }
    }
  });

  it('the record sent at connect supplies exactly the declared variables', async () => {
    // `learnerRecord` returns the first-session shape without a database, which is
    // the shape every conversation starts from when Supabase is unavailable.
    const { learnerRecord } = await import('./progress');
    const record = await learnerRecord('00000000-0000-0000-0000-000000000000');
    const declared = Object.keys(dynamicVariablePlaceholders()).sort();

    assert.deepEqual(
      Object.keys(record).sort(),
      declared,
      'learnerRecord() and the agent placeholders have drifted apart.',
    );
    for (const [key, value] of Object.entries(record)) {
      assert.equal(typeof value, 'string', `${key} must be a string`);
      assert.ok(value.length > 0, `${key} must not be empty`);
    }
  });
});
