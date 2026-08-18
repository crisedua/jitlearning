import type { Metadata } from 'next';
import { FeedbackForm } from '@/components/FeedbackForm';
import { listGrants, seatsLeft } from '@/lib/grants';
import { currentUser } from '@/lib/supabase/server';
import { FEEDBACK_DEAL, FEEDBACK_REWARD } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Feedback · ModoJIT',
  description: FEEDBACK_DEAL,
};

export const dynamic = 'force-dynamic';

/**
 * The feedback page: public on purpose. Someone who bounced without signing in
 * has exactly the feedback a sign-up flow never hears, so the form cannot sit
 * behind the Google gate. A signed-in visitor gets their email pre-filled —
 * one less field, and the grant lands on the right account.
 */
export default async function FeedbackPage() {
  const user = await currentUser().catch(() => null);
  // One read, used by the headline, the deal and the confirmation alike.
  const seatsOpen = seatsLeft(await listGrants()) > 0;

  return (
    <div className="mx-auto max-w-2xl px-6 py-16 lg:py-20">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Feedback</p>
      {/*
        The headline is the promise, so it has to know whether the promise is
        still available.
        
        Making only the confirmation conditional would be worse than leaving it
        alone: somebody reads "tu feedback vale 3 meses", writes for ten minutes
        about what did not work, and is told afterwards that the seats went. The
        withdrawal has to happen before the effort, not after it.
      */}
      {seatsOpen ? (
        <>
          <h1 className="mt-4 font-serif text-[clamp(2rem,5vw,3rem)] font-normal leading-[1.06] tracking-[-0.02em]">
            Tu feedback vale{' '}
            <span className="relative inline-block">
              {FEEDBACK_REWARD.months} meses
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-[0.1em] -z-10 h-[0.32em] bg-gold-soft"
              />
            </span>{' '}
            del plan {FEEDBACK_REWARD.plan}
          </h1>
          <p className="mt-5 max-w-[58ch] text-[17px] leading-relaxed text-muted">{FEEDBACK_DEAL}</p>
        </>
      ) : (
        <>
          <h1 className="mt-4 font-serif text-[clamp(2rem,5vw,3rem)] font-normal leading-[1.06] tracking-[-0.02em]">
            Los {FEEDBACK_REWARD.seats} cupos ya se usaron. Tu feedback sigue sirviendo.
          </h1>
          <p className="mt-5 max-w-[58ch] text-[17px] leading-relaxed text-muted">
            El trato de {FEEDBACK_REWARD.months} meses era para las primeras{' '}
            {FEEDBACK_REWARD.seats} personas y esas ya están. Lo que escribas acá lo leemos igual:
            dinos qué no funcionó, qué te faltó y qué te hizo cerrar la página. Eso es lo que
            cambia el producto.
          </p>
        </>
      )}

      <div className="mt-10">
        {/*
          Whether the deal is still open, asked rather than assumed.
          
          `grantFeedbackPlan` refuses the eleventh grant, because ten is a number
          printed on a public page and a number on a public page should be true.
          This page did not know that: with the seats gone it went on promising
          three months to anybody who wrote, and somebody would have given real
          feedback expecting a plan and received nothing.
          
          The count itself is not shown. "Quedan 10 de 10" tells a visitor that
          nobody has taken the offer, which is true and is the operator's to
          disclose rather than mine. What changes is only whether the promise is
          made at all.
        */}
        <FeedbackForm
          defaultEmail={user?.email ?? ''}
          signedIn={Boolean(user)}
          seatsOpen={seatsOpen}
        />
      </div>
    </div>
  );
}
