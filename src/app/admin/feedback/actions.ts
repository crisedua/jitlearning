'use server';

import { revalidatePath } from 'next/cache';
import { checkAdmin } from '@/lib/admin';
import { FEEDBACK_REASON, grantPlan, listGrants, seatsLeft } from '@/lib/grants';
import { FEEDBACK_REWARD } from '@/lib/site';

/**
 * Give somebody the plan the feedback page promised them.
 *
 * Gated on `checkAdmin` inside the action rather than only on the page that
 * renders the button: a server action is a public endpoint with a hard-to-guess
 * name, and "the page that shows it is gated" is not a check.
 *
 * The seat count is enforced here too, for the same reason. The site says ten
 * and a number printed on a public page should be true, so the eleventh grant is
 * refused rather than silently making the sentence a lie.
 */
export async function grantFeedbackPlan(
  _prev: { message: string } | null,
  form: FormData,
): Promise<{ message: string }> {
  const gate = await checkAdmin();
  if (!gate.ok) return { message: 'No autorizado.' };

  const userId = String(form.get('userId') ?? '').trim();
  if (!userId) return { message: 'Falta el usuario. Esa persona dejó feedback sin haber entrado.' };

  const grants = await listGrants();
  if (grants.some((g) => g.userId === userId)) {
    return { message: 'Esa persona ya tiene un plan activado.' };
  }
  if (seatsLeft(grants) <= 0) {
    return {
      message: `Ya se usaron los ${FEEDBACK_REWARD.seats} cupos. Cambia FEEDBACK_REWARD.seats si quieres ofrecer más.`,
    };
  }

  const planId = FEEDBACK_REWARD.planId;
  const result = await grantPlan(userId, planId, FEEDBACK_REWARD.months, FEEDBACK_REASON);
  if (!result.ok) return { message: `No se pudo activar: ${result.error}` };

  revalidatePath('/admin/feedback');
  return {
    message: `Listo: ${FEEDBACK_REWARD.months} meses de ${FEEDBACK_REWARD.plan}, hasta el ${new Date(
      result.until,
    ).toLocaleDateString('es-CL')}.`,
  };
}
