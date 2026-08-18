/**
 * Logs carry identifiers, never people.
 *
 * `/privacidad` describes what this product stores and who can read it. Logs are
 * a second store, kept by the platform, readable by whoever runs the deployment,
 * and not mentioned on that page — which is honest only while they hold nothing
 * about a person.
 *
 * They currently hold ids: a session, a step, a user, a Stripe event, a
 * customer. Nothing was keeping it that way, and the tempting line is easy to
 * picture. A write fails, somebody adds the email to find out whose, and now a
 * learner's address is in a log aggregator for a year because a query returned
 * an error one afternoon.
 *
 * The same argument applies to what a learner typed. `evidence` is a description
 * of their own work, `taught` is what the class covered, and a transcript is a
 * conversation about their job. None of that belongs in a line written to help
 * somebody debug a null.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..', '..');

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sources(full, out);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

/** Names that hold something a person said, wrote, or is called. */
const PERSONAL = /\$\{[^}]*\b(email|correo|name|nombre|full_?name|evidence|taught|summary|transcript|message|commitment|question|answer)\b[^}]*\}/i;

describe('what reaches the logs', () => {
  /*
   * The page says this now, so the test is what makes it true.
   *
   * "No llevan tu correo, ni tu nombre, ni nada de lo que dijiste o escribiste.
   * Es una regla que revisa una prueba automática, no una buena intención." That
   * sentence is only worth printing while this file exists and runs, so it
   * checks that the claim is still on the page as well as still true of the
   * code. Removing one without the other leaves either a promise nothing keeps
   * or a rule nobody knows about.
   */
  it('is a promise the privacy page actually makes', () => {
    const page = readFileSync(
      path.join(ROOT, 'src', 'app', 'privacidad', 'page.tsx'),
      'utf8',
    );
    assert.match(
      page,
      /Los registros técnicos/,
      'the privacy page no longer describes the logs, so this test guards nothing anybody was told',
    );
  });

  const files = sources(path.join(ROOT, 'src'));

  it('found the tree it is meant to check', () => {
    assert.ok(files.length > 40, `only ${files.length} runtime files found`);
  });

  it('never interpolates something personal into a log line', () => {
    const leaks: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const m of source.matchAll(/console\.(error|warn|log|info)\(([\s\S]{0,220}?)\);/g)) {
        if (PERSONAL.test(m[2]!)) {
          leaks.push(`${path.relative(ROOT, file)}: ${m[2]!.replace(/\s+/g, ' ').slice(0, 70)}`);
        }
      }
    }
    assert.deepEqual(leaks, [], `personal data written to the logs:\n  ${leaks.join('\n  ')}`);
  });

  /*
   * `console.log` is for a person watching a terminal, and nothing in `src`
   * runs in one. In a deployment it is noise at best, and at worst it is the
   * debugging line somebody left in, which is the usual way the rule above gets
   * broken. The scripts are exempt: printing is what they are for.
   */
  it('uses console.log nowhere in the app', () => {
    const noisy = files.filter((f) => /console\.log\(/.test(readFileSync(f, 'utf8')));
    assert.deepEqual(
      noisy.map((f) => path.relative(ROOT, f)),
      [],
      'console.log in runtime code: use console.error for a fault, or remove it',
    );
  });
});
