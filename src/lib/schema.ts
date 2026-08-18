/**
 * The columns whose absence breaks something silently.
 *
 * One list, read by `/api/health` (which runs inside the deployment) and by
 * `schema.test.ts` (which checks the list against the migrations that are
 * supposed to create them).
 *
 * ## Why columns and not tables
 *
 * Every schema failure this project has actually had was a column, or a
 * constraint on one, and each was invisible: `plan_steps.level` carrying the old
 * level names rejected every plan insert while the app logged and carried on;
 * `billing_events` without `handled_at` turns a payment that failed once into a
 * payment that is never retried; `profiles` without `plan_granted_until` makes
 * every comped plan permanent. A table can exist and still be a version behind,
 * which is the state a half-applied migration leaves and the state that reads as
 * working.
 *
 * `why` is written to be read by somebody who has just been woken up. It says
 * what stops working, not what is missing.
 */
export const MIGRATION_SENSITIVE: ReadonlyArray<{
  table: string;
  column: string;
  why: string;
}> = [
  { table: 'career_profiles', column: 'chosen_path', why: 'the teacher remembers nobody' },
  { table: 'plan_steps', column: 'minutes_before', why: 'no plan, and nothing to measure' },
  {
    table: 'plan_steps',
    column: 'recipe_prompt',
    why: 'every prompt the teacher dictates is lost when the call ends',
  },
  { table: 'session_summaries', column: 'conversation_id', why: 'no commitments carry over' },
  { table: 'feedback', column: 'message', why: 'the /feedback deal cannot collect anybody' },
  { table: 'billing_events', column: 'handled_at', why: 'a failed payment is never retried' },
  {
    table: 'purchase_intents',
    column: 'channel',
    why: 'nobody can tell that a person tried to buy',
  },
  { table: 'profiles', column: 'plan_granted_until', why: 'a comped plan never expires' },
  {
    table: 'profiles',
    column: 'subscription_status',
    why: 'nobody who measured their hours is ever shown the offer',
  },
  {
    /*
     * The bench's ledger, and the only entry whose absence costs money in the
     * other direction: everything keeps working.
     *
     * `/api/practica` writes one row per exchange and never throws on a failed
     * write, because losing a row must not cost a learner the answer they are
     * waiting on mid-class. So a deployment with an OpenRouter key and no
     * `practice_messages` table serves every practice message, bills none of
     * them, and reports nothing anywhere. The allowance the two views compute
     * simply never includes the bench.
     */
    table: 'practice_messages',
    column: 'billed_seconds',
    why: 'the practice bench spends money and none of it comes off anybody\'s minutes',
  },
  {
    /*
     * A view rather than a table, and the only entry here that costs money when
     * it is absent. `checkPlanAllowance` reads it to learn that the free tier is
     * a lifetime allowance; without it the code falls through to the monthly
     * view and hands every free learner twenty fresh minutes on the 1st,
     * forever. The comment in `account.ts` names that outcome and the fall-
     * through produces it silently.
     *
     * The conversion cost is the larger half. Running out is the moment somebody
     * decides whether this is worth paying for, and a tier that never runs out
     * never produces it.
     */
    table: 'plan_usage_total',
    column: 'period',
    why: 'the free tier never runs out, so nobody is ever asked to upgrade',
  },
];
