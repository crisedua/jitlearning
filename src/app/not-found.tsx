import type { Metadata } from 'next';
import Link from 'next/link';
import { TAGLINE } from '@/lib/site';

/**
 * A wrong address, answered in the language of the product.
 *
 * There was no `not-found`, so Next served its own: "404 · This page could not
 * be found", in English, on a Spanish product, with nothing to click.
 *
 * That is not a rare path here. This link travels through WhatsApp, where URLs
 * get truncated by a line break, autocorrected, or retyped from a screenshot —
 * and the person on the other end has been sent it by somebody they trust, has
 * no idea what the site is yet, and has just been told in a foreign language
 * that it does not exist. They do not try again.
 *
 * So it says what the site is and offers the two things a stranger could
 * actually want: the class and the prices. `noindex` because a 404 has nothing
 * to rank for.
 */
export const metadata: Metadata = {
  title: 'No encontramos esa página · ModoJIT',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <section className="mx-auto flex max-w-[44rem] flex-col px-6 py-24 sm:py-32">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
        No encontramos esa página
      </p>

      <h1 className="mt-4 max-w-[20ch] font-serif text-[clamp(2rem,5vw,3rem)] font-normal leading-[1.06] tracking-[-0.02em]">
        La dirección no existe, pero el profesor sí.
      </h1>

      <p className="mt-5 max-w-[54ch] text-[17px] leading-relaxed text-muted">
        {TAGLINE} Si llegaste por un enlace que alguien te mandó, puede que se haya cortado al
        copiarlo.
      </p>

      <div className="mt-9 flex flex-wrap items-center gap-3">
        <Link
          href="/coach"
          className="inline-flex items-center gap-2.5 rounded-full bg-accent px-6 py-3 text-[15px] font-medium text-white shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-accent-hover"
        >
          Empezar la primera clase
          <span aria-hidden className="font-mono">
            →
          </span>
        </Link>
        <Link
          href="/"
          className="inline-flex items-center rounded-full border border-line-strong px-5 py-2.5 text-[15px] font-medium text-ink transition duration-200 ease-out hover:border-accent hover:text-accent"
        >
          Ver de qué se trata
        </Link>
      </div>
    </section>
  );
}
