/**
 * Every live document says when it was written, in a shape the doctor can read.
 *
 * `npm run doctor` ages the corpus: it parses a date out of each file, fails past
 * four months and mentions anything past two. It does that over the files that
 * carry a date, and says nothing at all about the ones that do not — a document
 * with no date is not reported as undated, it is simply absent from the list,
 * while the run prints "Corpus checked N days ago at the oldest" about the
 * others and reads as a clean bill of health.
 *
 * So a document can go stale forever without any check noticing, which matters
 * because this corpus is the half of the teacher's knowledge that is supposed to
 * be current. The failure is silent and the fix is one line in the file, which
 * is the argument for catching it here rather than in review.
 *
 * The two accepted shapes are the ones `scripts/doctor.ts` parses. They have to
 * stay in step with it: a document this accepts and the doctor does not is
 * exactly the invisible case above.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { TEACHER } from './teacher';

const MONTHS =
  'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre';

/** "2026-07-29", as `Contrastado con la documentación oficial el ...`. */
const ISO = /\d{4}-\d{2}-\d{2}/;
/** "28 de julio de 2026", as `Datos verificados el ...`. */
const LONG = new RegExp(`\\d{1,2} de (${MONTHS}) de \\d{4}`, 'i');

/** The documents actually attachable to the teacher, per `TEACHER.sources`. */
function liveDocuments(): string[] {
  const out: string[] = [];
  for (const prefix of TEACHER.sources) {
    const dir = `knowledge/${prefix}`.replace(/\/+$/, '');
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.md')) out.push(`${dir}/${entry.name}`);
    }
  }
  return out;
}

describe('the live corpus can be aged', () => {
  const docs = liveDocuments();

  it('found the documents, so the assertions below mean something', () => {
    assert.ok(docs.length >= 3, `found only ${docs.length} document(s) under ${TEACHER.sources}`);
  });

  for (const file of docs) {
    it(`${file} says when it was written`, () => {
      const text = readFileSync(file, 'utf8');
      assert.ok(
        ISO.test(text) || LONG.test(text),
        `no date the doctor can parse, so this document is exempt from the staleness ` +
          `check forever and no run will ever mention it. Add one, as "2026-08-18" or ` +
          `as "18 de agosto de 2026".`,
      );
    });
  }
});
