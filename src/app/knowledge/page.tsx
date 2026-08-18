import type { Metadata } from 'next';
import { KnowledgeManager } from '@/components/KnowledgeManager';

/**
 * Unlinked, and now also unindexed.
 *
 * The route is deliberately reachable without a sign-in: whoever administers the
 * corpus needs it, every call it makes carries INGEST_SECRET, and the page
 * itself holds nothing — without the secret the APIs answer 401, or 503 when the
 * deployment has none. That reasoning is sound and it stopped one step short.
 *
 * Every other administrative surface here says `index: false`, and this one did
 * not, so a page headed "Administración" with a secret field on it was eligible
 * to appear in a search for this product's name. Nothing is exposed by that. It
 * invites people to try, and it is the sort of result that makes a stranger
 * deciding whether to pay wonder what else is loose.
 */
export const metadata: Metadata = {
  title: 'Base de conocimiento · ModoJIT',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function KnowledgePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-7 px-6 py-10">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
          Administración
        </p>
        <h1 className="mt-3 font-serif text-[clamp(2rem,4vw,2.75rem)] font-normal leading-[1.08] tracking-[-0.02em]">
          Base de conocimiento
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
          Sube archivos, extrae enlaces o pega notas. Todo se divide, se convierte en
          vectores y se indexa para que el profesor recupere solo lo que hace falta.
        </p>
      </header>
      <KnowledgeManager />
    </div>
  );
}
