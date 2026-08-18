/**
 * What is left of an allowance, computed once.
 *
 * The subtraction lived in three places: the offer on `/progreso`, the record
 * `/api/signed-url` hands the teacher, and the meter in `BalanceNote`. Three
 * copies of one number that all describe the same thing to the same person in
 * the same session — what the learner reads before pressing start, what the
 * teacher is told it has left, and (since the session timers) when the nudge to
 * close and measure goes out.
 *
 * Nothing forced them to agree. A rounding change or a grace margin in one would
 * have produced a page saying five minutes, a teacher believing seven, and a
 * countdown firing against a third figure, with no test and no error anywhere.
 * That is the fifth time in this codebase a duplicated implementation has
 * drifted or been fixed in only one of its copies, and deleting the copies has
 * been the only answer that held.
 *
 * Free of imports on purpose: `BalanceNote` is a client component and the module
 * that produces a balance talks to Postgres.
 */

export interface UsageBalance {
  /** Minutes and sessions spent in the plan's window, including unreconciled rows. */
  minutes: number;
  sessions: number;
  /** The plan's limits; null = unlimited. */
  monthlyMinutes: number | null;
  monthlySessions: number | null;
  /**
   * Which window those numbers cover. `total` is a lifetime allowance and belongs
   * to the free tier; `month` resets on the 1st.
   */
  period: 'month' | 'total';
}

/**
 * Minutes still available, or null when the plan does not meter them.
 *
 * Floored and clamped at zero: a partial minute is not a minute somebody can
 * use, and a negative balance is a soft cap that has already been crossed, which
 * reads to a learner as an error rather than as generosity.
 */
export function minutesLeft(balance: UsageBalance | null): number | null {
  if (!balance || balance.monthlyMinutes === null) return null;
  return Math.max(0, Math.floor(balance.monthlyMinutes - balance.minutes));
}

/** Sessions still available, or null when the plan does not meter them. */
export function sessionsLeft(balance: UsageBalance | null): number | null {
  if (!balance || balance.monthlySessions === null) return null;
  return Math.max(0, balance.monthlySessions - balance.sessions);
}
