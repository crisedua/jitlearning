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
export function wrapUpAt(minutesLeft: number | null): { close: number; last: number } | null {
  const end = Math.min(minutesLeft ?? CLASS_CAP_MINUTES, CLASS_CAP_MINUTES);
  if (end <= 2) return null;
  return { close: Math.max(end - 5, 0.5), last: Math.max(end - 1, 1) };
}
