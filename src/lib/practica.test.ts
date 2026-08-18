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
  DEFAULT_MODEL,
  MAX_UPLOAD_BYTES,
  resolveModel,
  SANDBOX_TOOL,
  sheetToText,
  textToPrompt,
  tooLarge,
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

/*
 * Vercel rejects a request body over about 4.5 MB before the route runs, so a
 * learner who attaches four big files gets "el banco no está disponible" and no
 * clue why — the platform answered, not us. The ceiling has to be caught in the
 * browser, where the files still exist and the message can say which ones.
 */
describe('when the attachments are too big to send', () => {
  it('lets a normal set through', () => {
    assert.equal(tooLarge([200_000, 500_000]), null);
  });

  it('stops the set that the platform would reject', () => {
    const complaint = tooLarge([MAX_UPLOAD_BYTES, MAX_UPLOAD_BYTES]);
    assert.ok(complaint, 'oversized attachments were allowed through');
    assert.match(complaint, /MB/);
  });

  it('stays under the platform ceiling with room for the multipart framing', () => {
    assert.ok(
      MAX_UPLOAD_BYTES < 4.5 * 1024 * 1024,
      `${MAX_UPLOAD_BYTES} bytes is at or over the body limit that rejects the request`,
    );
  });

  /*
   * The per-file cap has to be reachable: one file at the limit must still be
   * sendable, or the size message names a number nobody can satisfy.
   */
  it('accepts one file at the per-file limit', () => {
    assert.equal(tooLarge([3 * 1024 * 1024]), null);
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
 * The teacher opens the bench by naming a model out loud, and what arrives is a
 * word from a conversation rather than an identifier. Two things must not
 * happen with it: it must not reach OpenRouter — an agent that can name any
 * slug can name an expensive one, or one that does not exist, and we pay for
 * the attempt either way — and it must not fail the tool call, because a failed
 * tool inside a voice class is a teacher apologising for a panel.
 */
describe('when the teacher names a model', () => {
  it('takes the three ids it was told to send', () => {
    for (const id of ['gemini', 'claude', 'chatgpt']) {
      assert.equal(resolveModel(id)?.id, id);
    }
  });

  it('takes the full slug, for when the agent repeats one back', () => {
    assert.equal(resolveModel('google/gemini-3.7-flash')?.id, 'gemini');
  });

  it('takes the family names people actually say', () => {
    assert.equal(resolveModel('el de Google')?.id, 'gemini');
    assert.equal(resolveModel('Chat GPT')?.id, 'chatgpt');
    assert.equal(resolveModel('OpenAI')?.id, 'chatgpt');
    assert.equal(resolveModel('Anthropic')?.id, 'claude');
    assert.equal(resolveModel('SONNET')?.id, 'claude');
  });

  it('refuses a model we do not serve rather than passing it through', () => {
    assert.equal(resolveModel('mistralai/mixtral-8x22b'), null);
    assert.equal(resolveModel('llama'), null);
  });

  it('refuses nothing at all, so the caller falls back rather than sending ""', () => {
    assert.equal(resolveModel(''), null);
    assert.equal(resolveModel(null), null);
    assert.equal(resolveModel(undefined), null);
  });

  it('has a default that is one of the three', () => {
    assert.ok(practiceModel(DEFAULT_MODEL), `${DEFAULT_MODEL} is not a model we serve`);
  });
});

/*
 * The tool's description is the only thing deciding when the bench opens, so it
 * is an instruction and not documentation. Both failure modes are real: never
 * opening teaches a class about an assistant the learner cannot reach, and
 * opening always puts a panel in front of somebody walking with no screen.
 */
describe('the tool the teacher fires', () => {
  it('is a client tool, because nothing on our server can open a panel', () => {
    assert.equal(SANDBOX_TOOL.type, 'client');
  });

  it('requires the model, so the panel never opens on a guess', () => {
    assert.deepEqual(SANDBOX_TOOL.parameters.required, ['model']);
    assert.ok(SANDBOX_TOOL.parameters.properties.model);
    assert.ok(SANDBOX_TOOL.parameters.properties.task);
  });

  it('tells the teacher when NOT to open it', () => {
    assert.match(SANDBOX_TOOL.description, /caminando|manejando/);
  });

  it('names the three by the words the learner would use', () => {
    for (const model of PRACTICE_MODELS) {
      assert.match(
        SANDBOX_TOOL.description + JSON.stringify(SANDBOX_TOOL.parameters),
        new RegExp(model.id, 'i'),
        `${model.label} is not named anywhere the agent can see`,
      );
    }
  });

  /*
   * Every exchange reaches the teacher on its own over the open call. Without
   * this line the teacher asks what the assistant said, which is the exact
   * interrogation the bench exists to end.
   */
  it('tells the teacher the exchanges arrive by themselves', () => {
    assert.match(SANDBOX_TOOL.description, /te van a llegar solos/);
  });

  it('waits for the browser, so the teacher knows the panel is really there', () => {
    assert.equal(SANDBOX_TOOL.expects_response, true);
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
      assert.match(prompt, /Cuando le abras el banco de práctica/);
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
