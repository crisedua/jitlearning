import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCEPTED_EXTENSIONS,
  attachmentKind,
  benchUpdate,
  MAX_FILE_CHARS,
  PRACTICE_MODELS,
  practiceModel,
  refusalFor,
  secondsForSpend,
  sheetToText,
  textToPrompt,
  USD_PER_MINUTE,
} from './practica';
import { teacherSystemPrompt } from './agent';

const GEMINI = practiceModel('gemini')!;

/*
 * A model that is shown a fifth of a file and told nothing will compute over
 * the fifth and say the number with a straight face. The learner then writes it
 * into a report.
 *
 * This is the failure the whole product is organised against — the landing page
 * calls it "no inventa" — and the bench is the one place where *we* choose how
 * much of the file the model sees. Truncating silently would make our own
 * tooling the source of the invention we teach people to catch.
 */
describe('when a file is bigger than the bench will send', () => {
  const rows = Array.from({ length: 4_000 }, (_, i) => [`fila-${i}`, String(i * 7), 'texto']);

  it('tells the model it is only seeing part of the file', () => {
    const text = sheetToText('ventas.xlsx', rows, 2_000);
    assert.match(text, /CORTADO/);
    assert.match(text, /No calcules totales/);
  });

  it('tells the model how many rows it is missing', () => {
    const text = sheetToText('ventas.xlsx', rows, 2_000);
    assert.match(text, new RegExp(`de ${rows.length}`));
  });

  it('cuts on a row boundary, so no row arrives with columns missing', () => {
    const text = sheetToText('ventas.xlsx', rows, 2_000);
    const body = text.split('\n').slice(1);
    // Every line before the marker is a whole row: three fields.
    for (const line of body) {
      if (line.startsWith('[CORTADO')) break;
      assert.equal(line.split(',').length, 3, `partial row: ${line}`);
    }
  });

  it('says the same thing for a plain text file', () => {
    const text = textToPrompt('notas.txt', 'x'.repeat(MAX_FILE_CHARS + 10));
    assert.match(text, /CORTADO/);
  });

  it('leaves a file that fits completely alone', () => {
    const small = [['a', 'b'], ['1', '2']];
    const text = sheetToText('chico.csv', small, 2_000);
    assert.doesNotMatch(text, /CORTADO/);
    assert.match(text, /1,2/);
  });
});

describe('when a cell contains the delimiter', () => {
  it('quotes it, so the columns do not shift', () => {
    const text = sheetToText('x.csv', [['Pérez, Ana', 'ok']], 500);
    assert.match(text, /"Pérez, Ana",ok/);
  });

  it('escapes quotes rather than ending the field early', () => {
    const text = sheetToText('x.csv', [['dijo "hola"', 'ok']], 500);
    assert.match(text, /"dijo ""hola""",ok/);
  });
});

/*
 * The bench spends real money on a key we hold, charged against an allowance a
 * learner can exhaust. Every exchange has to cost something: an unmetered path
 * through a paid API is the shape of the bill nobody notices until it arrives.
 */
describe('what a practice message takes off the allowance', () => {
  it('is never zero, however cheap the call was', () => {
    assert.ok(secondsForSpend(0.0000001) >= 1);
  });

  it('is never zero when the price never arrived', () => {
    assert.ok(secondsForSpend(0) >= 1);
    assert.ok(secondsForSpend(Number.NaN) >= 1);
    assert.ok(secondsForSpend(-1) >= 1);
  });

  it('grows with the price, so the meter is monotonic', () => {
    assert.ok(secondsForSpend(0.05) > secondsForSpend(0.005));
  });

  it('charges about a minute for a call that costs about a minute', () => {
    const seconds = secondsForSpend(USD_PER_MINUTE);
    assert.ok(seconds >= 60 && seconds <= 61, `charged ${seconds}s for one minute of spend`);
  });

  /*
   * A guard on the conversion rather than on the arithmetic. If the cost model
   * ever produces a per-minute figure near zero, every practice message starts
   * costing hours of allowance and the first anybody hears of it is a learner
   * locked out after one exercise.
   */
  it('rests on a per-minute cost that is a real number of cents', () => {
    assert.ok(
      USD_PER_MINUTE > 0.01 && USD_PER_MINUTE < 1,
      `USD_PER_MINUTE is ${USD_PER_MINUTE}, which is not a plausible cost per spoken minute`,
    );
  });
});

/*
 * The update is the entire point of the bench: it is what turns a blind teacher
 * into one that can see the learner's screen. Two things have to survive any
 * edit to it — the content, and the instruction about what to do with it.
 */
describe('what the teacher is told after an exchange', () => {
  const update = benchUpdate({
    model: GEMINI,
    prompt: 'Consolida estos tres archivos en una tabla',
    attachments: ['enero.xlsx', 'febrero.xlsx'],
    answer: 'Listo, junté las tres hojas y el total es 4.812.',
  });

  it('carries what the learner wrote and what came back', () => {
    assert.match(update, /Consolida estos tres archivos/);
    assert.match(update, /el total es 4\.812/);
  });

  it('names the files, so the teacher knows what it was working from', () => {
    assert.match(update, /enero\.xlsx, febrero\.xlsx/);
  });

  it('names which assistant answered', () => {
    assert.match(update, /Gemini/);
  });

  /*
   * Without this the model treats an inbound update as something to
   * acknowledge — "ya vi que te respondió" — which spends a spoken turn of a
   * ten-minute class saying nothing.
   */
  it('tells the teacher to react to it rather than announce it', () => {
    assert.match(update, /No anuncies que lo viste/);
  });

  it('trims a long answer instead of pushing the session rules out of context', () => {
    const long = benchUpdate({
      model: GEMINI,
      prompt: 'x',
      attachments: [],
      answer: 'palabra '.repeat(5_000),
    });
    assert.ok(long.length < 4_000, `update was ${long.length} characters`);
    assert.match(long, /cortado/);
  });
});

describe('which files the bench takes', () => {
  it('reads the spreadsheet formats a learner actually has', () => {
    assert.equal(attachmentKind('ventas.xlsx'), 'sheet');
    assert.equal(attachmentKind('ventas.csv'), 'text');
  });

  it('ignores the case of the extension', () => {
    assert.equal(attachmentKind('VENTAS.XLSX'), 'sheet');
  });

  it('refuses what it cannot read', () => {
    assert.equal(attachmentKind('contrato.doc'), null);
  });

  /*
   * A refusal is only useful if it names the next move. ".xls" and ".doc" are
   * the two that turn up, and both are twenty seconds from being readable.
   */
  it('tells them how to convert the two formats that turn up', () => {
    assert.match(refusalFor('viejo.xls'), /\.xlsx|\.csv/);
    assert.match(refusalFor('contrato.docx'), /PDF/);
  });

  it('offers the file picker exactly what it can parse', () => {
    for (const ext of ACCEPTED_EXTENSIONS) {
      assert.ok(attachmentKind(`archivo${ext}`), `${ext} is offered but not handled`);
    }
  });
});

describe('the three the learner can pick', () => {
  it('are the three products they will go and use on their own', () => {
    assert.deepEqual(
      PRACTICE_MODELS.map((m) => m.label),
      ['Gemini', 'Claude', 'ChatGPT'],
    );
  });

  /*
   * The bench runs the models, not the products, and the difference is
   * something a learner discovers the moment they open the real one. `detail`
   * is where that claim is made exact, so it has to name a specific model.
   */
  it('each name a specific model, not just a family', () => {
    for (const m of PRACTICE_MODELS) {
      assert.ok(m.detail.length > m.label.length, `${m.label} has no specific model named`);
      assert.match(m.model, /^[a-z-]+\/\S+$/, `${m.label}: ${m.model} is not a provider slug`);
    }
  });

  it('resolves an unknown id to nothing rather than to a default', () => {
    assert.equal(practiceModel('gpt4'), null);
    assert.equal(practiceModel(''), null);
  });
});

/*
 * The behaviour the bench was built to end.
 *
 * A real class went three turns deep asking a learner how many rows their
 * spreadsheet had, while she had it open in front of her. That was not a model
 * being obtuse: it was the only move available to a teacher with no eyes, and
 * the persona had nothing in it forbidding the question.
 *
 * These assert on the rules rather than on a heading, because a heading can
 * survive the deletion of everything under it.
 */
describe('the persona, on asking for what the tool can see', () => {
  for (const search of [true, false]) {
    const prompt = teacherSystemPrompt({ search });
    const which = search ? 'with search' : 'without search';

    it(`forbids interviewing the learner about their own file (${which})`, () => {
      assert.match(prompt, /Nunca le pidas datos que la herramienta puede leer sola/);
    });

    it(`caps the questions asked before anything is done (${which})`, () => {
      assert.match(prompt, /Dos preguntas como máximo antes de la primera acción/);
    });

    it(`makes handing over the material the first practical step (${which})`, () => {
      assert.match(prompt, /El primer paso práctico es meter el material dentro del asistente/);
    });

    it(`knows the bench exists and what arrives from it (${which})`, () => {
      assert.match(prompt, /banco de práctica/);
      assert.match(prompt, /cada envío te llega con lo que escribió y lo que le respondieron/);
    });

    /*
     * The rehearsal framing, which is a commercial promise and not a nicety:
     * the weekly saving has to keep working in the learner's own account after
     * they stop paying us.
     */
    it(`sends the real task to the learner's own account (${which})`, () => {
      assert.match(prompt, /la tarea de verdad la repite después en su propia cuenta/);
    });
  }
});
