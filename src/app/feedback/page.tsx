import type { Metadata } from 'next';
import { FeedbackForm } from '@/components/FeedbackForm';
import { currentUser } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Feedback · ModoJIT',
  description:
    'Cuéntanos qué te sirvió y qué cambiarías del coach. A cambio, seis meses de acceso completo gratis.',
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

  return (
    <div className="mx-auto max-w-2xl px-6 py-16 lg:py-20">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Feedback</p>
      <h1 className="mt-4 font-serif text-[clamp(2rem,5vw,3rem)] font-normal leading-[1.06] tracking-[-0.02em]">
        Tu feedback vale{' '}
        <span className="relative inline-block">
          seis meses
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-[0.1em] -z-10 h-[0.32em] bg-gold-soft"
          />
        </span>{' '}
        de acceso
      </h1>
      <p className="mt-5 max-w-[58ch] text-[17px] leading-relaxed text-muted">
        Estamos en beta y lo que más necesitamos es saber qué te sirvió y qué no. Cuéntanoslo —
        lo bueno y lo malo, sin filtro — y te activamos seis meses de acceso completo, gratis.
      </p>

      <div className="mt-10">
        <FeedbackForm defaultEmail={user?.email ?? ''} />
      </div>
    </div>
  );
}
