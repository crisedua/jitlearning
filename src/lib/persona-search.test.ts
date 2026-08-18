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

/*
 * Both variants have to satisfy the checks that guard the persona.
 *
 * The doctor reads the searching variant unconditionally, so when the persona
 * gained a second form it started reporting "6 of 6" about a persona that was
 * not the one live on the agent. The rule it got wrong is the one whose wording
 * differs between them: with a tool, do not guess, look it up; without one, do
 * not guess, say you cannot and give the general criterion.
 *
 * Pinned here rather than only in the doctor because the doctor needs an API key
 * and this does not, so a persona edit that drops a rule from one variant fails
 * in the suite rather than on somebody's laptop.
 */
describe('what the doctor checks holds for both variants', () => {
  const HONESTY: string[][] = [
    ['Nunca cifras sin fuente'],
    ['criterio general'],
    ['Nunca atribuyas'],
    ['Nunca prometas un trabajo'],
    ['usa la herramienta buscar', 'tampoco ofrezcas buscarla'],
    ['nunca digas que buscaste'],
  ];

  const SHAPE = [
    '## El mapa',
    '## El plan y el currículum',
    'los dos minutos de privacidad',
    'pregúntale cuánto tarda normalmente',
    '### Sesiones siguientes',
  ];

  for (const search of [true, false]) {
    const label = search ? 'with the search tool' : 'without the search tool';

    it(`keeps every honesty rule ${label}`, () => {
      const persona = teacherSystemPrompt({ search });
      for (const phrases of HONESTY) {
        assert.ok(
          phrases.some((p) => persona.includes(p)),
          `no phrasing of this rule survives: ${phrases.join(' / ')}`,
        );
      }
    });

    it(`keeps the session shape ${label}`, () => {
      const persona = teacherSystemPrompt({ search });
      for (const marker of SHAPE) {
        assert.ok(persona.includes(marker), `lost: ${marker}`);
      }
    });

    it(`fits the budget ${label}`, () => {
      const length = teacherSystemPrompt({ search }).length;
      assert.ok(length <= 16_000, `${length} chars, over the 16000 the agent accepts`);
    });
  }
});

/*
 * The substitution has to find its target.
 *
 * The no-search persona is the full one with three passages swapped out, so each
 * constant has to match the prompt body character for character. Edit the body
 * and not the constant and the swap becomes a no-op, which ships a teacher
 * offering a search it cannot run: the exact bug the variant exists to prevent.
 *
 * `swap` throws on a miss, so this is a check that the throw is wired to every
 * passage rather than a check of the prompt's contents. It renders both forms,
 * which is all it takes, and it matters because `next build` never renders a
 * persona and would deploy the mistake happily.
 */
describe('the no-search substitution', () => {
  it('replaces every passage it means to, or says so', () => {
    assert.doesNotThrow(() => teacherSystemPrompt({ search: false }));
    assert.doesNotThrow(() => teacherSystemPrompt({ search: true }));
  });

  it('actually shortens the prompt, so no swap was a silent no-op', () => {
    const full = teacherSystemPrompt({ search: true });
    const lean = teacherSystemPrompt({ search: false });
    assert.ok(
      full.length - lean.length > 200,
      `only ${full.length - lean.length} chars removed, so a passage was probably not swapped`,
    );
  });
});

/*
 * The page promises something for a learner who is not at a screen.
 *
 * "Si vas caminando, la dictan y la terminas después" and "los números se
 * cierran en la clase siguiente" are on the landing page, in the numbered steps
 * somebody reads before deciding. The persona said only that a learner might be
 * walking and then assumed a screen for the rest of the session, so the teacher
 * could not perform either half.
 *
 * This is the same contract `PROMISE_MARKERS` enforces for the four headline
 * promises, applied to a claim that sits in the how-it-works steps instead. A
 * promise is a promise wherever it is printed.
 */
describe('the learner who has no screen', () => {
  for (const search of [true, false]) {
    it(`is handled in the ${search ? 'searching' : 'no-search'} persona`, () => {
      const persona = teacherSystemPrompt({ search });
      assert.match(
        persona,
        /Si va caminando o no tiene pantalla a mano/,
        'no instruction for a learner away from a screen',
      );
      assert.match(persona, /le dictas qué va a escribir/, 'does not say to dictate the steps');
      assert.match(
        persona,
        /cierran los números la clase siguiente/,
        'does not close the numbers later',
      );
    });
  }
});
