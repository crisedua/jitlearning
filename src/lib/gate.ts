/**
 * The one phrase that turns a limit into a link.
 *
 * `checkPlanAllowance` runs on the server and returns a sentence. `VoiceTutor`
 * renders it in the browser and, when the limit is one the learner can do
 * something about, turns the mention of the plans page into an actual anchor and
 * strips it from the prose so it is not read twice.
 *
 * That is a contract between a server module and a client component held together
 * by a substring, which is exactly the kind of agreement that rots quietly: write
 * "en /planes," with a comma, or move the phrase to the start of a sentence, and
 * the link silently stops appearing while everything still compiles and the
 * message still reads fine. Nobody would notice, and the person who does not see
 * it is somebody who just hit a wall and would have upgraded.
 *
 * So both sides import from here, and `gate.test.ts` checks every message the
 * gate can produce against these helpers.
 *
 * Deliberately free of server imports so the client bundle can have it.
 */

/** Appended to any gate message the learner can resolve by upgrading. */
export const UPGRADE_MARKER = ' en /planes';

/** Whether this message offers a way out that the plans page can satisfy. */
export function offersUpgrade(message: string): boolean {
  return message.includes(UPGRADE_MARKER);
}

/** The message without the phrase, for when the link is rendered separately. */
export function withoutUpgradeMarker(message: string): string {
  return message.replace(UPGRADE_MARKER, '');
}
