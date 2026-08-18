'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * When a page throws, said in the language of the product.
 *
 * There was no error boundary, so React's default took over: a blank screen, or
 * "Application error: a client-side exception has occurred", in English, with
 * nothing to click. The sibling of the missing 404, and the more likely of the
 * two to be met by somebody real — a mistyped URL takes effort, while a page
 * that throws takes a slow database and a bad moment.
 *
 * It matters most exactly where it is worst. `/progreso` renders the hours a
 * learner just earned and the offer beside them; `/coach` is the page they
 * pressed a button on. An English stack message there does not read as a
 * hiccup, it reads as a product that broke while they were trying to use it,
 * and they were already deciding whether this was worth paying for.
 *
 * `reset()` is React's own retry, which re-renders the segment without a full
 * reload. Most of what throws here is a slow read rather than a broken page, so
 * trying again is genuinely the right first move — and it keeps the session,
 * which a reload would make them wait for.
 *
 * ## No `global-error.tsx`, deliberately
 *
 * That one catches a throw in the root layout, which replaces `<html>` and so
 * cannot use the fonts, the palette or any component here — it would be a second
 * copy of this page written in inline styles. The layout it guards renders three
 * fonts, a nav and a footer from static data and has nothing in it that reads a
 * database or parses input, so the case is remote and the duplicate is
 * permanent. Worth revisiting the day the layout starts doing real work.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The learner gets a sentence; the detail goes where somebody can act on
    // it. `digest` is what ties this to a specific server log line.
    console.error('[app] render failed:', error.digest ?? error.message);
  }, [error]);

  return (
    <section className="mx-auto flex max-w-[44rem] flex-col px-6 py-24 sm:py-32">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Algo falló</p>

      <h1 className="mt-4 max-w-[22ch] font-serif text-[clamp(2rem,5vw,3rem)] font-normal leading-[1.06] tracking-[-0.02em]">
        Esta página no cargó bien.
      </h1>

      <p className="mt-5 max-w-[54ch] text-[17px] leading-relaxed text-muted">
        No se perdió nada de lo que hiciste: tus clases, tus números y tu plan están guardados.
        Vuelve a intentarlo y, si sigue igual, escríbenos y lo revisamos.
      </p>

      <div className="mt-9 flex flex-wrap items-center gap-3">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2.5 rounded-full bg-accent px-6 py-3 text-[15px] font-medium text-white shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-accent-hover"
        >
          Reintentar
        </button>
        <Link
          href="/progreso"
          className="inline-flex items-center rounded-full border border-line-strong px-5 py-2.5 text-[15px] font-medium text-ink transition duration-200 ease-out hover:border-accent hover:text-accent"
        >
          Ir a tu progreso
        </Link>
      </div>

      {/*
        The digest, small and last. It is the only thing that ties what they saw
        to a line in the logs, and asking somebody to describe a blank page is
        how a bug report becomes unusable.
      */}
      {error.digest && (
        <p className="mt-10 font-mono text-[12px] text-soft">Referencia: {error.digest}</p>
      )}
    </section>
  );
}
