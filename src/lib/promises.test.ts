/**
 * Every behaviour the landing page describes, checked against the persona.
 *
 * `PROMISE_MARKERS` already ties the four headline promises to sentences in the
 * prompt, and that contract has caught real drift. It covers four claims. The
 * page makes more than four: the numbered how-it-works steps and the comparison
 * table each describe something the teacher is supposed to do, and a reader
 * treats those as promises too, because they are printed in the same voice on
 * the same screen while they decide.
 *
 * One of them was not performable. "Si vas caminando, la dictan y la terminas
 * después" and "los números se cierran en la clase siguiente" were on the page
 * for weeks while the persona said only that a learner might be walking and then
 * assumed a screen. Nothing failed, because nothing was looking.
 *
 * The patterns below match the sentence that makes each claim true rather than a
 * word that happens to appear near it, so deleting the behaviour breaks the
 * test. That is the same rule `PROMISE_MARKERS` learned when its markers were
 * section headings and parity passed on copy the persona no longer backed.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { teacherSystemPrompt } from './agent';
import { PROMISES, STEPS } from './site';

/** claim on the page → the sentence in the persona that performs it. */
const PERFORMED: ReadonlyArray<[string, RegExp]> = [
  ['asks four things, one per turn', /Una cosa por turno/],
  ['asks what tools they already have', /qué usa|herramientas/i],
  ['privacy briefing before real material', /dos minutos de privacidad[\s\S]{0,90}Antes, nunca después/],
  ['guides the task step by step', /qué abrir, qué escribir/],
  ['dictates for a learner with no screen', /Si no tiene pantalla a mano/],
  ['closes those numbers in the next class', /cierra los números la clase siguiente/],
  ['says the subtraction out loud', /dile la resta en una frase/],
  ['the map comes after the task, not before', /va después de su primera tarea resuelta, no antes/],
  ['one class per weekly task', /una clase por cada tarea de su semana/],
  ['opens on the previous commitment', /Lo primero que vale de ese registro es el compromiso/],
  ['refuses an unevidenced "yes I did it"', /no aceptes "sí, lo hice"/],
  ['names the source when it has one', /nómbralo en media frase/],
  ['labels general knowledge as such', /criterio general/],
  ['no figures without a source', /Nunca cifras sin fuente/],
];

describe('what the page says the teacher does', () => {
  it('has a page to check against', () => {
    // If these ever empty out, every assertion below would pass on nothing.
    assert.ok(PROMISES.length >= 4, `only ${PROMISES.length} promises on the page`);
    assert.ok(STEPS.length >= 4, `only ${STEPS.length} how-it-works steps`);
  });

  for (const search of [true, false]) {
    for (const [claim, performed] of PERFORMED) {
      it(`${claim} — ${search ? 'with search' : 'without search'}`, () => {
        assert.match(
          teacherSystemPrompt({ search }),
          performed,
          `the page says this and the persona cannot do it`,
        );
      });
    }
  }
});
