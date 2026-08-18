/**
 * The audits that find stale prose, kept because they found things.
 *
 * Four passes over the comments in this repository, each of which has caught a
 * sentence that was true when written and had stopped being:
 *
 *   - claims about failure   "degrades to", "never fails"
 *   - claims of exclusivity  "and nothing else", "the only"
 *   - claims about a change  "strips", "converts", "is removed"
 *   - claims about a number  "three months", "fifteen seconds"
 *
 * ## Why this is a script and not a test
 *
 * Every one of these is a heuristic over prose. The exclusivity pass matches ten
 * sentences and eight are rhetorical; the similarity pass finds sixteen pairs and
 * most are the honesty vocabulary recurring on purpose. A test that fails on
 * those is a test people learn to skip, which costs more than the drift it
 * catches.
 *
 * So this prints and exits zero. It is for a person to read, occasionally, and
 * the output is a list of sentences to check rather than a verdict. Where one of
 * these finds something a machine can decide — the grant length, the lesson that
 * counts its own parts — that check moved into the suite and is not repeated
 * here.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sources(full, out);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

interface Pass {
  title: string;
  why: string;
  pattern: RegExp;
}

const PASSES: Pass[] = [
  {
    title: 'Claims about failure',
    why: 'Each says what happens when something breaks. Check the code still does that.',
    pattern: /\b(degrades? to|never fails?|cannot fail|falls? back|fails? open|best-effort)\b/i,
  },
  {
    title: 'Claims of exclusivity',
    why: 'Each says something is the only one. They break the day a second appears.',
    pattern: /\b(and by nothing else|by nothing else|is the only|the only (way|thing|place|caller))\b/i,
  },
  {
    title: 'Claims about a transformation',
    why: 'Each says what a function does to data. Two have described behaviour that never existed.',
    pattern: /\b(strips?|removes?|drops?|converts?|normalis(es|ed)|is (stripped|removed|converted))\b/i,
  },
  {
    title: 'Claims about a number',
    why: 'Each is a copy of a constant. Two said six months while the product said three.',
    pattern: /\b(one|two|three|four|five|six|ten|fifteen|twenty|thirty|ninety)[- ](seconds?|minutes?|hours?|days?|months?|parts?|people)\b/i,
  },
];

const files = [...sources(path.join(ROOT, 'src')), ...sources(path.join(ROOT, 'scripts'))];
let total = 0;

for (const pass of PASSES) {
  const hits: string[] = [];

  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const text = line.trim();
      if (!text.startsWith('*') && !text.startsWith('//')) return;
      if (!pass.pattern.test(text)) return;
      hits.push(`  ${path.relative(ROOT, file)}:${i + 1}  ${text.replace(/^[*/ ]+/, '').slice(0, 96)}`);
    });
  }

  total += hits.length;
  console.log(`\n${pass.title} — ${hits.length}`);
  console.log(`  ${pass.why}\n`);
  for (const hit of hits.slice(0, 12)) console.log(hit);
  if (hits.length > 12) console.log(`  … and ${hits.length - 12} more`);
}

console.log(`\n${total} sentence(s) worth re-reading. None of this is a failure.\n`);
