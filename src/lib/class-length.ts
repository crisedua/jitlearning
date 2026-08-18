/**
 * How long a class can actually run.
 *
 * ElevenLabs hangs up a conversation at `max_duration_seconds` and this repo
 * never set it, so the agent carried the platform's own 600 — ten minutes —
 * which nothing here had chosen and nothing here knew about.
 *
 * That mattered because the classroom schedules its two wrap-up prompts off the
 * learner's remaining balance: five minutes out, close the task and ask what it
 * takes now; one minute out, say the subtraction and take a commitment. With a
 * free tier of 20 minutes those fire at 15 and 19, and with a paid tier of 300
 * at 295 and 299. The call is gone at 10. For every real learner, neither one
 * ever fired: the teacher was never told to wrap up, never asked for the second
 * number, and the class ended mid-sentence.
 *
 * The subtraction is the entire product. It is what the notebook counts, what
 * the offer is priced against, and what the persona is told never to invent.
 * A class that cannot reach it produces nothing worth paying for, and the
 * doctor has been reporting the symptom since the first real session: zero of
 * one classes ended with both numbers.
 *
 * Kept at ten minutes rather than raised to meet the fifteen the site promises,
 * because how long a class should be is a commercial decision — it moves both
 * the promise on the landing page and the cost of every session, and the break
 * even already sits under the advertised allowance. Stated here so the number
 * is chosen, shared, and can be changed in one place.
 */
export const CLASS_CAP_MINUTES = 10;

/** The same figure in the unit the agent config wants. */
export const CLASS_CAP_SECONDS = CLASS_CAP_MINUTES * 60;

/**
 * When the teacher should start closing, given what the learner has left.
 *
 * The end of a class is whichever comes first: the balance running out or the
 * platform hanging up. Scheduling against the balance alone is what silently
 * disabled both prompts.
 *
 * Returns minutes from the start of the call, or null when there is no room to
 * warn — under about two minutes there is nothing useful to say that is not
 * itself the interruption.
 */
/**
 * The shortest class that can produce anything.
 *
 * A class exists to finish one task and measure it, and the measuring is two
 * questions and a subtraction. Below this there is no room for the closing at
 * all, which is why `wrapUpAt` returns nothing: there is no useful moment to
 * warn about when the whole class is shorter than the warning.
 *
 * Named because two places need it. The classroom uses it to decide there is
 * nothing to schedule, and the note above the start button uses it to stop
 * telling somebody with one minute left that it is enough to finish what they
 * are doing.
 */
export const MIN_USEFUL_MINUTES = 2;

export function wrapUpAt(
  minutesLeft: number | null,
): { close: number; last: number; closeRemaining: number } | null {
  const end = Math.min(minutesLeft ?? CLASS_CAP_MINUTES, CLASS_CAP_MINUTES);
  if (end <= MIN_USEFUL_MINUTES) return null;

  /*
   * How much of the class to spend closing, as a share of it rather than a
   * fixed five minutes.
   *
   * Five was calibrated for a class that no longer exists. Against the real
   * ceiling it told the teacher to stop working and start closing at the
   * halfway mark, and against a learner with six minutes of balance left it
   * fired at minute one, leaving 83 percent of the class to a wind-down.
   *
   * The closing is short work: finish what is open, ask how long it took, say
   * the difference, take a commitment. It does not need half a class. What
   * does need the time is the task itself, because a class that does not
   * finish one produces no second number and therefore nothing to sell.
   *
   * Never less than two minutes, because the subtraction and the commitment
   * both have to fit, and never more than five, because beyond that the extra
   * warning buys nothing.
   */
  const closing = Math.min(5, Math.max(2, end * 0.3));
  return {
    close: Math.max(end - closing, 0.5),
    last: Math.max(end - 1, 1),
    closeRemaining: Math.round(closing),
  };
}
