/**
 * What the teacher ends up saying when it looks something up.
 *
 * `consultar` itself needs an API key, a billed search and a model that answers
 * differently every time, so none of it was ever exercised. The judgement is not
 * in the request anyway: it is in what gets read back out of the response, which
 * is `readLookup`, which is pure over a list of blocks.
 *
 * The shapes below are the documented content shape of a server-side web search
 * turn: narration, `server_tool_use`, `web_search_tool_result`, answer.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readLookup, toSentences } from './consulta';

const hit = (url: string, title = 'Precios') => ({
  type: 'web_search_result',
  title,
  url,
  page_age: 'April 30, 2025',
});

const searched = (...results: unknown[]) => ({
  type: 'web_search_tool_result',
  tool_use_id: 's1',
  content: results,
});

const said = (text: string) => ({ type: 'text', text });
const calling = { type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'x' } };

describe('reading the answer out of a search turn', () => {
  it('drops the narration the model emits before the search', () => {
    /*
     * The bug this guards: joining every text block put "déjame buscar" in front
     * of the answer. It is said after the search already ran, the persona has
     * already announced the lookup out loud, and it ate one of the three
     * sentences, which in practice cost the recency qualifier at the end.
     */
    const { answer } = readLookup([
      said('Buena pregunta, déjame buscar el precio actual.'),
      calling,
      searched(hit('https://x.com/precios')),
      said(
        'Según la página de precios de X, el plan cuesta 20 dólares al mes. ' +
          'El gratis limita a 50 consultas. La cifra es de esta semana.',
      ),
    ]);

    assert.ok(!answer.includes('déjame buscar'), answer);
    assert.ok(answer.startsWith('Según la página de precios'), answer);
    assert.ok(answer.includes('La cifra es de esta semana.'), answer);
  });

  it('keeps only what follows the last search when there are several', () => {
    const { answer, searches } = readLookup([
      said('Primero busco el precio.'),
      calling,
      searched(hit('https://a.com')),
      said('Ahora reviso si cambió.'),
      calling,
      searched(hit('https://b.com')),
      said('Cuesta 20 dólares y no ha cambiado este año.'),
    ]);

    assert.equal(answer, 'Cuesta 20 dólares y no ha cambiado este año.');
    assert.equal(searches, 2);
  });

  it('keeps the whole answer when no search ran', () => {
    const { answer, searches, sources } = readLookup([
      said('Eso no necesita búsqueda. Es criterio general.'),
    ]);

    assert.equal(answer, 'Eso no necesita búsqueda. Es criterio general.');
    assert.equal(searches, 0);
    assert.deepEqual(sources, []);
  });

  it('does not count a search that errored, so the answer stays marked unsourced', () => {
    // A failed search leaves the answer exactly as unsourced as no search at all,
    // and `searches: 0` is what tells the caller that.
    const { searches, sources } = readLookup([
      calling,
      { type: 'web_search_tool_result', tool_use_id: 's1', content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' } },
      said('No pude buscarlo.'),
    ]);

    assert.equal(searches, 0);
    assert.deepEqual(sources, []);
  });

  it('never invents a source: only real result blocks with a url count', () => {
    const { sources } = readLookup([
      calling,
      searched(
        hit('https://real.com'),
        { type: 'web_search_result', title: 'Sin url' },
        { type: 'something_else', url: 'https://no.com' },
      ),
      said('Listo.'),
    ]);

    assert.deepEqual(
      sources.map((s) => s.url),
      ['https://real.com'],
    );
  });

  it('counts the same url from two searches once', () => {
    const { sources } = readLookup([
      calling,
      searched(hit('https://x.com/precios')),
      calling,
      searched(hit('https://x.com/precios', 'Precios (otra vez)')),
      said('Listo.'),
    ]);

    assert.equal(sources.length, 1);
  });

  it('falls back to the url when the result has no title, since the agent says the title', () => {
    const { sources } = readLookup([
      calling,
      searched({ type: 'web_search_result', url: 'https://x.com/p', title: '   ' }),
      said('Listo.'),
    ]);

    assert.equal(sources[0]!.title, 'https://x.com/p');
  });
});

describe('trimming an answer for voice', () => {
  it('keeps whole sentences up to the limit', () => {
    assert.equal(toSentences('Una. Dos. Tres. Cuatro.', 3), 'Una. Dos. Tres.');
  });

  it('bounds text the sentence split cannot cut', () => {
    // The bug this guards: with no terminal punctuation the split returned null
    // and the whole thing came back, so the three-sentence cap silently did not
    // apply and the teacher read a wall of text to somebody walking.
    const runOn = 'palabra '.repeat(400).trim();
    const out = toSentences(runOn, 3);

    assert.ok(out.length <= 601, `${out.length} chars`);
    assert.ok(out.endsWith('.'), out);
    assert.ok(!out.endsWith('pal.'), 'cut mid-word');
  });

  it('leaves a short answer alone', () => {
    assert.equal(toSentences('  Cuesta 20 dólares.  ', 3), 'Cuesta 20 dólares.');
  });

  it('returns empty for empty, so the caller can say it found nothing', () => {
    assert.equal(toSentences('', 3), '');
    assert.equal(toSentences('   ', 3), '');
  });
});
