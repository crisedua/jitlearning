import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { siftDolores, toSignal, RADAR_SCOPES, type Dolor } from './radar-llm';

/*
 * The radar's two model calls cost money and take two minutes, so the parts of
 * it worth checking are the parts that decide what survives them. Everything
 * below is the pure half: which curated pains become rows, and what those rows
 * look like once they land in `pain_signals` for the coach to search.
 */

const pain = (over: Partial<Dolor> = {}): Dolor => ({
  titulo: 'Cobrar a clientes que no pagan',
  cita: 'Llevo tres meses persiguiendo una boleta de 400 mil y no sé qué más hacer.',
  url: 'https://reddit.com/r/emprendedores/comments/1abc',
  idioma: 'es',
  pais: 'CL',
  foro: 'r/emprendedores',
  tema: 'cobro',
  senales: ['queja espontánea'],
  puntaje_evidencia: 70,
  puntaje_total: 82,
  veredicto: 'painkiller',
  ...over,
});

describe('what survives the curation', () => {
  it('drops what the model itself called noise', () => {
    const { candidates, dropped } = siftDolores([pain({ veredicto: 'ruido' })], new Set());
    assert.equal(candidates.length, 0);
    assert.equal(dropped, 1);
  });

  it('keeps painkillers and vitamins, which are both real pain', () => {
    const { candidates } = siftDolores(
      [pain(), pain({ url: 'https://x.com/2', veredicto: 'vitamin' })],
      new Set(),
    );
    assert.equal(candidates.length, 2);
  });

  it('drops a repeat inside one batch, counting it once', () => {
    const { candidates, dropped } = siftDolores([pain(), pain()], new Set());
    assert.equal(candidates.length, 1);
    assert.equal(dropped, 1);
  });

  it('drops anything that is not a URL, since the evidence rule is the URL', () => {
    const { candidates } = siftDolores([pain({ url: 'no lo encontré' })], new Set());
    assert.equal(candidates.length, 0);
  });

  it('drops a URL already in the table', () => {
    const { candidates, dropped } = siftDolores(
      [pain()],
      new Set(['https://reddit.com/r/emprendedores/comments/1abc']),
    );
    assert.equal(candidates.length, 0);
    assert.equal(dropped, 1);
  });

  /*
   * The regression. The exclusion check used to be `prose.includes(url)` against
   * the formatted block sent to the model, so a new finding was discarded
   * whenever its URL appeared anywhere inside that paragraph — including as a
   * prefix of a different, longer URL.
   *
   * Reddit serves the same post at both lengths, so this was the ordinary case:
   * the stored row has the slug, the model quotes the canonical short link, and
   * a real new pain is counted as a duplicate and never seen.
   */
  it('keeps a new URL that is a prefix of a stored one', () => {
    const stored = new Set([
      'https://reddit.com/r/emprendedores/comments/1abc/como_cobro_a_un_cliente',
    ]);
    const { candidates } = siftDolores(
      [pain({ url: 'https://reddit.com/r/emprendedores/comments/1abc' })],
      stored,
    );
    assert.equal(candidates.length, 1, 'a substring match is discarding real findings again');
  });

  it('counts one drop per pain, not one per reason', () => {
    // Noise and a duplicate at once is still a single lost row.
    const { dropped } = siftDolores([pain(), pain({ veredicto: 'ruido' })], new Set());
    assert.equal(dropped, 1);
  });
});

describe('the row the coach ends up searching', () => {
  it('ranks by the total score, which is what pain-search orders on', () => {
    assert.equal(toSignal(pain({ puntaje_total: 91 }), 'cl').score, 91);
  });

  it('records the scope it came from, so a run can be traced', () => {
    assert.equal(toSignal(pain(), 'latam').query, 'radar-llm:latam');
    assert.ok(RADAR_SCOPES.latam);
  });

  it('never invents a country', () => {
    assert.equal(toSignal(pain({ pais: null }), 'all').country, null);
    assert.equal(toSignal(pain({ pais: 'Chile' }), 'all').country, null, 'a name is not a code');
    assert.equal(toSignal(pain({ pais: 'cl' }), 'all').country, 'CL');
  });

  it('strips the r/ so the community matches the scraped rows', () => {
    assert.equal(toSignal(pain({ foro: 'r/Emprendedores' }), 'cl').community, 'emprendedores');
    assert.equal(toSignal(pain({ foro: null }), 'cl').community, null);
  });

  it('collapses whitespace in a title and bounds its length', () => {
    const long = toSignal(pain({ titulo: 'a\n  b'.padEnd(400, 'x') }), 'cl');
    assert.ok(!long.title.includes('\n'));
    assert.ok(long.title.length <= 300);
  });

  it('marks the verdict as one of the two that are kept', () => {
    assert.equal(toSignal(pain({ veredicto: 'painkiller' }), 'cl').verdict, 'painkiller');
    assert.equal(toSignal(pain({ veredicto: 'vitamin' }), 'cl').verdict, 'vitamin');
  });

  it('carries the quote, which is the whole evidence rule', () => {
    assert.ok(toSignal(pain(), 'cl').excerpt?.includes('boleta'));
  });
});
