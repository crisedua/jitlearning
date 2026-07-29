import type { Metadata } from 'next';
import { JetBrains_Mono, Manrope } from 'next/font/google';
import Link from 'next/link';
import './globals.css';

/**
 * Two typefaces, four weights between them. Manrope carries the interface;
 * JetBrains Mono is only for the things a learner must copy exactly — commands,
 * URLs, ids — where a humanist typeface makes `l` and `1` ambiguous.
 */
const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-manrope',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Aprendizaje JIT · Coach de aprendizaje',
  description: 'Coach de aprendizaje justo a tiempo con agentes de voz de ElevenLabs y RAG',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${manrope.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen bg-bg font-sans text-ink">
        <header className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur">
          <nav className="mx-auto flex max-w-[96rem] items-center gap-3 px-6 py-3.5">
            <Link
              href="/"
              className="flex items-center gap-2.5 rounded-sm font-semibold tracking-tight"
            >
              <span
                aria-hidden
                className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-[13px] font-bold text-white shadow-sm"
              >
                JIT
              </span>
              Aprendizaje JIT
            </Link>

            <span aria-hidden className="ml-1 h-4 w-px bg-line" />

            <span className="text-sm text-muted">Coach de aprendizaje</span>

            {/*
              No link to /knowledge. The route still works for whoever
              administers the corpus — it asks for the ingest secret anyway — but
              it is not part of the learner's navigation.
            */}
          </nav>
        </header>

        {/*
          Wide on purpose: the coach page is a two-column layout, and at a narrow
          measure the sidebar ate the transcript. Prose that needs a short line
          length caps itself locally instead.
        */}
        <main className="mx-auto max-w-[96rem] px-6 py-8 sm:py-10">{children}</main>
      </body>
    </html>
  );
}
