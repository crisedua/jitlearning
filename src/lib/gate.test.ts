/**
 * The messages a learner sees when they hit a limit.
 *
 * These are shown to the most motivated person this product ever has: somebody
 * who wanted another conversation badly enough to try, and was stopped. Two
 * things have to hold, and neither is checked by anything else.
 *
 * The link has to appear. `checkPlanAllowance` builds the sentence on the server
 * and `VoiceTutor` renders it in the browser, turning the mention of the plans
 * page into an anchor and stripping it from the prose so it is not read twice.
 * That agreement is a substring, and a substring shared across a server/client
 * boundary with no type between them rots without any symptom: the message still
 * reads fine, everything still compiles, and the link just stops being there.
 *
 * And the prose has to survive having the phrase removed. A message that reads
 * "o puedes subir de plan ." after the strip is a small ugliness in the one place
 * where the product is asking to be paid.
 *
 * The message bodies below are copied from `account.ts` rather than imported,
 * because importing it drags in the Supabase server client. That copy is the
 * point: if somebody rewords a message without the marker, these fail.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { UPGRADE_MARKER, offersUpgrade, withoutUpgradeMarker } from './gate';

/** Every gate message, as `account.ts` builds them. */
const MESSAGES = {
  /*
   * The courtesy plan ending was missing from this list while the scan below
   * counted it, so it was checked for the marker and never read as a sentence.
   * It is the highest-intent message the product has: somebody who spent three
   * months and several hundred minutes and has just been stopped. If any of
   * these has to read well, it is that one.
   */
  grantEnded: `Se acabaron tus meses de cortesía. Lo que mediste sigue en tu página de progreso: para seguir con tus clases, mira los planes${UPGRADE_MARKER}.`,
  freeLifetime: `Usaste los 20 minutos gratis. Para seguir con tu plan de clases, mira los planes${UPGRADE_MARKER}.`,
  monthlyMinutes: `Alcanzaste los 300 minutos de tu plan este mes. El contador vuelve a cero el día 1, o puedes subir de plan${UPGRADE_MARKER}.`,
  monthlySessions: `Alcanzaste las 40 conversaciones de tu plan este mes. El contador vuelve a cero el día 1, o puedes subir de plan${UPGRADE_MARKER}.`,
};

describe('what a learner is told when they run out', () => {
  for (const [name, message] of Object.entries(MESSAGES)) {
    it(`${name}: offers a way out`, () => {
      // Every limit here is one the learner can resolve by paying. A message
      // that does not offer that is a dead end in front of a willing buyer.
      assert.ok(offersUpgrade(message), message);
    });

    it(`${name}: still reads as a sentence once the link is pulled out`, () => {
      const prose = withoutUpgradeMarker(message);
      assert.ok(!prose.includes('/planes'), prose);
      assert.ok(!/\s\.$/.test(prose), `dangling space before the full stop: ${prose}`);
      assert.match(prose, /\.$/, prose);
    });
  }

  it('leaves a message with no marker alone', () => {
    const other = 'No se pudo conectar con el profesor.';
    assert.equal(offersUpgrade(other), false);
    assert.equal(withoutUpgradeMarker(other), other);
  });

  /*
   * The reason this file can be trusted: it asserts against copies, so it is only
   * worth anything if the copies still match the source. This reads account.ts
   * and checks that every gate message is built through the shared constant
   * rather than by writing the path out again.
   */
  it('account.ts builds every gate message through the shared marker', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'src', 'lib', 'account.ts'),
      'utf8',
    );

    /*
     * Every template literal inside `checkPlanAllowance`.
     *
     * Two earlier versions of this scan keyed on layout and both undercounted.
     * The first matched on the `allowed: false` line above the message and found
     * two of three, because a comment sat between them. The second matched
     * ``error: `...` `` and found two of four the moment a message became a
     * ternary — caught by the count assertion below, which is the whole reason
     * that assertion exists.
     *
     * So: take the function and read every backtick literal in it. The messages
     * are the only templated strings it contains, and nothing about where they
     * sit on the page can hide one.
     */
    const start = source.indexOf('export async function checkPlanAllowance');
    assert.ok(start > 0, 'checkPlanAllowance not found in account.ts');
    const body = source
      .slice(start, source.indexOf('\nexport ', start + 1))
      // Comments in this file quote identifiers in backticks, and those are not
      // messages. Strip them rather than inventing a filter that tells a
      // sentence from a table name.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    const errors = [...body.matchAll(/`([^`]*)`/g)].map((m) => m[1]!);

    assert.ok(errors.length >= 4, `found ${errors.length} gate messages, expected at least 4`);

    /*
     * And the fixtures above have to keep pace with them.
     *
     * The scan checks every message for the marker; the fixtures check that each
     * one reads as a sentence and offers a way out. A message in the source and
     * not in the fixtures gets the cheap half of that and not the half that
     * matters, which is what happened to the courtesy-plan message.
     */
    assert.equal(
      errors.length,
      Object.keys(MESSAGES).length,
      `account.ts has ${errors.length} gate messages and this file lists ${Object.keys(MESSAGES).length}`,
    );

    for (const message of errors) {
      assert.ok(
        message.includes('${UPGRADE_MARKER}'),
        `gate message does not use UPGRADE_MARKER: ${message}`,
      );
      assert.ok(
        !message.includes('/planes'),
        `gate message writes the path out instead of using the marker: ${message}`,
      );
    }
  });
});
