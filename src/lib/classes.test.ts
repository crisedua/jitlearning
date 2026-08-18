/**
 * Counting what the classes say, without blaming a class for a question nobody
 * asked it.
 *
 * This logic was wrong twice in two days, both times in the same direction. The
 * extraction fields arrived over several syncs and the success criteria arrived
 * after every conversation on the agent, so a conversation can carry twenty
 * fields, or three, or none, and can carry no verdict at all. "Produced no
 * numbers" and "was never asked for numbers" are both common here, and they mean
 * opposite things to somebody deciding whether the product works: the first says
 * fix the teacher, the second says go and have a class.
 *
 * The fixtures below are the real eras on this agent, not invented ones.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { summarise, type Analysis } from './classes';

/** Today: the full extraction config, both minute fields present and answered. */
const measured: Analysis = {
  data_collection_results: {
    task_minutes_before: { value: '90' },
    task_minutes_after: { value: '25' },
    commitment: { value: 'algo' },
  },
};

/** Today: asked for the numbers, and the person said "un día". */
const askedAndMissed: Analysis = {
  data_collection_results: {
    task_minutes_before: { value: null, rationale: 'El usuario dijo "Un día", lo cual no es' },
    task_minutes_after: { value: '' },
    commitment: { value: 'algo' },
  },
};

/** Early August: three fields configured, none of them the minutes. */
const olderConfig: Analysis = {
  data_collection_results: { commitment: { value: 'algo' } },
};

/** Older still: analysed, but no extraction configured at all. */
const noFields: Analysis = { data_collection_results: {} };

describe('summarising what the classes produced', () => {
  it('does not count a class that was never asked for the numbers', () => {
    const r = summarise([olderConfig, noFields]);
    assert.equal(r.analysed, 1, 'the empty one carries no analysis worth counting');
    assert.equal(r.measurable, 0, 'nobody asked, so nothing failed');
    assert.equal(r.measured, 0);
    assert.equal(r.whyNot, null, 'there is no reason to quote when no question was put');
  });

  it('counts a class that was asked and did not answer, and says why', () => {
    const r = summarise([askedAndMissed]);
    assert.equal(r.measurable, 1);
    assert.equal(r.measured, 0);
    assert.match(r.whyNot ?? '', /Un día/);
  });

  it('counts a class that answered both', () => {
    const r = summarise([measured]);
    assert.equal(r.measurable, 1);
    assert.equal(r.measured, 1);
    assert.equal(r.whyNot, null);
  });

  it('mixes eras without letting the old ones drag the ratio down', () => {
    const r = summarise([measured, askedAndMissed, olderConfig, noFields]);
    assert.equal(r.analysed, 3);
    assert.equal(r.measurable, 2, 'only the two that carry both keys');
    assert.equal(r.measured, 1);
  });

  /*
   * The half-answered case. One number is not a measurement: the offer needs the
   * subtraction, so counting it would promise a headline that never appears.
   */
  it('does not count one number as measured', () => {
    const half: Analysis = {
      data_collection_results: {
        task_minutes_before: { value: '90' },
        task_minutes_after: { value: '' },
      },
    };
    const r = summarise([half]);
    assert.equal(r.measurable, 1);
    assert.equal(r.measured, 0);
  });

  it('treats an ungraded class as unmarked rather than failed', () => {
    const r = summarise([measured, askedAndMissed]);
    assert.equal(r.graded, 0);
    assert.equal(r.finished, 0, 'zero here means nobody graded, and the page must say so');
  });

  it('counts verdicts only where they exist', () => {
    const passed: Analysis = {
      data_collection_results: { task_minutes_before: { value: '9' }, task_minutes_after: { value: '4' } },
      evaluation_criteria_results: { tarea_terminada: { result: 'success' } },
    };
    const failed: Analysis = {
      data_collection_results: { commitment: { value: 'x' } },
      evaluation_criteria_results: { tarea_terminada: { result: 'failure' } },
    };
    const r = summarise([passed, failed, measured]);
    assert.equal(r.graded, 2, 'the ungraded one is not in the denominator');
    assert.equal(r.finished, 1);
  });

  it('says nothing at all about no classes', () => {
    const r = summarise([]);
    assert.deepEqual(
      { ...r },
      { analysed: 0, measurable: 0, measured: 0, graded: 0, finished: 0, passed: {}, whyNot: null },
    );
  });
});

/*
 * All four criteria are counted.
 *
 * The funnel leads with "finished a real task" and the other three are what
 * tell somebody which fix to make: no numbers is usually a unit or a clock, a
 * missing commitment is the closing being skipped, and a failed honesty check
 * is the persona. Counting only the first would send them rewriting the session
 * order for a fault in its last minute.
 */
describe('the verdicts on a graded class', () => {
  const graded = (results: Record<string, 'success' | 'failure'>): Analysis => ({
    data_collection_results: { commitment: { value: 'algo' } },
    evaluation_criteria_results: Object.fromEntries(
      Object.entries(results).map(([k, v]) => [k, { result: v }]),
    ),
  });

  it('counts each criterion separately', () => {
    const r = summarise([
      graded({ tarea_terminada: 'success', dos_numeros: 'failure', sin_inventar: 'success' }),
      graded({ tarea_terminada: 'failure', dos_numeros: 'failure', sin_inventar: 'success' }),
    ]);
    assert.equal(r.graded, 2);
    assert.deepEqual(r.passed, { tarea_terminada: 1, sin_inventar: 2 });
    assert.equal(r.finished, 1, 'the headline number still agrees with its criterion');
  });

  it('records nothing for a criterion nobody graded', () => {
    const r = summarise([graded({ tarea_terminada: 'success' })]);
    assert.equal(r.passed.dos_numeros, undefined, 'absent is not zero');
  });
});
