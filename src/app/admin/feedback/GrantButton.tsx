'use client';

import { useActionState } from 'react';
import { FEEDBACK_REWARD } from '@/lib/site';
import { grantFeedbackPlan } from './actions';

/**
 * Activate the deal for one person.
 *
 * A form posting to a server action rather than a fetch: the result is a
 * database write and a message, and the page re-renders with the seat count and
 * the expiry date already updated.
 *
 * The button says what it will do, including the number of months, because the
 * thing it is about to promise is finite and the person pressing it is the one
 * who has to mean it.
 */
export function GrantButton({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState(grantFeedbackPlan, null);

  if (state?.message) {
    return <p className="text-[13px] leading-relaxed text-success">{state.message}</p>;
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-full border border-line-strong px-4 py-1.5 text-[13px] font-medium transition duration-200 ease-out hover:border-accent hover:text-accent disabled:opacity-60"
      >
        {pending
          ? 'Activando…'
          : `Activar ${FEEDBACK_REWARD.months} meses de ${FEEDBACK_REWARD.plan}`}
      </button>
    </form>
  );
}
