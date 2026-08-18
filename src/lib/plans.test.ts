/**
 * How the value claim reads out loud.
 *
 * `spellMinutes` renders the recovered-hours figure, which sits directly above
 * the price and is the only claim this product makes about its own worth. It is
 * pure arithmetic on a number the learner supplied, so the arithmetic was never
 * the risk. The grammar was: it pluralised `hora` and not `minuto`, so any total
 * ending in one read "1 minutos".
 *
 * A small error in the one sentence whose whole job is to look careful.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { spellMinutes } from './plans';

describe('saying a saving out loud', () => {
  it('uses the singular for one minute', () => {
    assert.equal(spellMinutes(1), '1 minuto');
    assert.equal(spellMinutes(61), '1 hora y 1 minuto');
    assert.equal(spellMinutes(121), '2 horas y 1 minuto');
  });

  it('uses the plural for everything else', () => {
    assert.equal(spellMinutes(2), '2 minutos');
    assert.equal(spellMinutes(59), '59 minutos');
    assert.equal(spellMinutes(65), '1 hora y 5 minutos');
  });

  it('uses the singular for one hour', () => {
    assert.equal(spellMinutes(60), '1 hora');
    assert.equal(spellMinutes(90), '1 hora y 30 minutos');
  });

  it('drops the minutes on a whole number of hours', () => {
    assert.equal(spellMinutes(120), '2 horas');
    assert.equal(spellMinutes(180), '3 horas');
  });

  it('gets the plural right at every size a learner could reach', () => {
    // Ten hours is far past any real weekly saving, which is the point: the
    // sentence has to hold for whatever number they actually produce.
    for (let n = 1; n <= 600; n++) {
      const said = spellMinutes(n);
      assert.ok(!/\b1 minutos\b/.test(said), said);
      assert.ok(!/\b1 horas\b/.test(said), said);
      assert.ok(!/\b(?!1\b)\d+ minuto\b/.test(said), said);
      assert.ok(!/\b(?!1\b)\d+ hora\b/.test(said), said);
      assert.ok(!/\by 0 minutos?\b/.test(said), said);
    }
  });
});
