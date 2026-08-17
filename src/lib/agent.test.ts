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
import { dataCollection, dynamicVariablePlaceholders, teacherSystemPrompt } from './agent';

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
  it('the persona references only variables the agent declares defaults for', () => {
    const persona = teacherSystemPrompt();
    const declared = new Set(Object.keys(dynamicVariablePlaceholders()));

    for (const m of persona.matchAll(/\{\{(\w+)\}\}/g)) {
      assert.ok(
        declared.has(m[1]!),
        `the prompt uses {{${m[1]}}} with no placeholder. A conversation that does not supply it fails outright.`,
      );
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
