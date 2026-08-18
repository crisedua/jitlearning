/**
 * The persona must not promise a search the agent cannot run.
 *
 * `setup:tools` needs INGEST_SECRET, so a deployment can be live with a persona
 * saying "usa la herramienta buscar" and an agent with no such tool. What that
 * produces in a class is the teacher announcing a lookup, going quiet, and then
 * apologising, inside a voice call where the silence is the entire cost.
 *
 * These pin the two halves that are easy to get wrong: that the variant really
 * drops every offer to look something up, and that dropping them does not also
 * drop the rule against *claiming* to have looked. A teacher with no search that
 * has been freed to say it searched is worse than the bug this fixes.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { teacherSystemPrompt } from './agent';

const withSearch = teacherSystemPrompt();
const without = teacherSystemPrompt({ search: false });

describe('the persona without a search tool', () => {
  it('defaults to the searching variant, so nothing silently loses the feature', () => {
    assert.equal(teacherSystemPrompt(), teacherSystemPrompt({ search: true }));
    assert.notEqual(withSearch, without);
  });

  it('makes no offer to look anything up', () => {
    for (const promise of [
      'usa la herramienta buscar',
      'Avísale antes que vas a buscar',
      'Lo que vuelve de una búsqueda',
      'La única excepción es la búsqueda',
    ]) {
      assert.ok(withSearch.includes(promise), `fixture drifted: ${promise}`);
      assert.ok(!without.includes(promise), `still promises: ${promise}`);
    }
  });

  it('still forbids saying it searched', () => {
    assert.match(without, /nunca digas que buscaste/i);
  });

  it('still tells it what to do with a question it cannot answer', () => {
    assert.match(without, /criterio general/);
    assert.match(without, /no la adivines/);
  });

  /*
   * Both variants are pushed to a live agent, so both have to fit. The budget is
   * checked for the full persona elsewhere; the point here is that the shorter
   * one cannot be the one that overruns.
   */
  it('is not longer than the persona it replaces', () => {
    assert.ok(without.length <= withSearch.length, `${without.length} > ${withSearch.length}`);
  });

  it('keeps the rules that have nothing to do with searching', () => {
    for (const rule of ['Nunca prometas un trabajo', 'Nada de emojis', 'Nunca cifras sin fuente']) {
      assert.ok(without.includes(rule), `lost: ${rule}`);
    }
  });
});
