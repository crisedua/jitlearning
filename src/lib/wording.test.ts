/**
 * Nothing a person reads still calls this a coach.
 *
 * The product was a set of coaches and became one voice teacher. That rename is
 * not cosmetic: a screenshot of stale coach cards is what started the whole
 * repositioning, and copy that still says "coach" tells a learner they are using
 * something this product no longer is.
 *
 * Swept by hand twice. The second sweep reported the learner-facing pages clean
 * while two instances survived — "retómalo con tu coach" on the pending
 * commitment every returning learner sees, and "el coach está hablando", which
 * is what a screen reader announces during a session — because the grep was
 * piped through `head` and the output was cut at twenty lines.
 *
 * A check does not get tired and does not truncate.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();

/**
 * What may legitimately contain the word.
 *
 * Two kinds. Identifiers — a table name, a route, an animation cue, a prop that
 * distinguishes which side of a transcript is speaking — are code, and renaming
 * them would change nothing a person sees.
 *
 * And the retired product, by name. `/admin/radar` says the pain radar "se
 * construyó para el coach de emprendedores, que se retiró": naming the thing
 * that was removed is the opposite of stale copy, and a check that forbade it
 * would push somebody to delete an accurate sentence.
 */
const ALLOWED = [
  /coach_sessions/g,
  /CoachExplorer/g,
  /startCoachSession/g,
  /finishCoachSession/g,
  /coachSession\w*/g,
  /coachTyping/g,
  /CUES\.coach/g,
  // The cue table's own key, `coach: 4600`, which is a millisecond offset.
  /\bcoach: \d+/g,
  /['"]coach['"]/g,
  /'user' \| 'coach'/g,
  /['"`/]\/coach['"`/]?/g,
  /\/coach\b/g,
  // The retired product, named as retired.
  /coach de emprendedores/gi,
];

function readable(file: string): string {
  let text = readFileSync(file, 'utf8')
    // Comments are for us, not for the reader.
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  for (const pattern of ALLOWED) text = text.replace(pattern, '');
  return text;
}

function components(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...components(full));
    else if (/\.tsx$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('what the product calls itself', () => {
  const files = [
    ...components(path.join(ROOT, 'src', 'components')),
    ...components(path.join(ROOT, 'src', 'app')),
  ];

  it('found the files, so the check below means something', () => {
    assert.ok(files.length >= 20, `only ${files.length} components scanned`);
  });

  for (const file of files) {
    const rel = path.relative(ROOT, file);
    it(`${rel} says teacher, not coach`, () => {
      const hits = [...readable(file).matchAll(/\bcoach(es)?\b/gi)];
      assert.equal(
        hits.length,
        0,
        `${rel} still says "coach" in text a person reads. The product is a profesor.`,
      );
    });
  }
});

/**
 * Nothing claims other people did something they have not done.
 *
 * The pricing page badged its recommended tier "El más elegido" — the most
 * chosen — which is a statement about other customers on a product that has
 * none. `site.ts` names "no unverifiable statistics" in its own copy rules, and
 * the fourth promise on the landing page is "No inventa. Ninguna cifra sin
 * fuente."
 *
 * A fabricated popularity claim on the page that asks for money disproves that
 * promise more cheaply than any answer the teacher could give, and social proof
 * is the first thing anybody adds when a page feels quiet. So it is checked
 * rather than remembered.
 *
 * The feedback deal's "las primeras 10 personas" is deliberately not caught: a
 * cap on how many will be let in claims nothing about how many already are.
 */
const INVENTED_CROWD = [
  /más elegido/i,
  /más popular/i,
  /el favorito/i,
  /la mayoría de (?:nuestros|los) (?:alumnos|usuarios|clientes)/i,
  /(?:miles|cientos|decenas) de (?:personas|alumnos|usuarios|profesionales)/i,
  /\b\d+\s*(?:personas|alumnos|usuarios)\s+(?:ya|han|llevan)\b/i,
  /lo usan? \d+/i,
];

describe('what the product claims about other people', () => {
  const files = [
    ...components(path.join(ROOT, 'src', 'components')),
    ...components(path.join(ROOT, 'src', 'app')),
    path.join(ROOT, 'src', 'lib', 'site.ts'),
    path.join(ROOT, 'src', 'lib', 'plans.ts'),
  ];

  it('found the files, so the check below means something', () => {
    assert.ok(files.length >= 20, `only ${files.length} files scanned`);
  });

  for (const file of files) {
    const rel = path.relative(ROOT, file);
    it(`${rel} claims no crowd it does not have`, () => {
      const text = readable(file);
      for (const pattern of INVENTED_CROWD) {
        const hit = pattern.exec(text);
        assert.ok(
          !hit,
          `${rel} says "${hit?.[0]}" — a claim about other customers. This product ` +
            `sells on not inventing figures; recommend it in its own name instead.`,
        );
      }
    });
  }
});
