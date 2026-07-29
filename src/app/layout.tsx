import type { Metadata } from 'next';
import { JetBrains_Mono, Manrope } from 'next/font/google';
import Link from 'next/link';
import { PROFILE, hasContact } from '@/lib/site';
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
  title: 'Aprendizaje JIT',
  description: 'Coach de aprendizaje justo a tiempo con agentes de voz de ElevenLabs y RAG',
};

/** Anchors live on the home page, so they are prefixed to work from any route. */
const NAV = [
  { href: '/#que-hace', label: 'Qué hace' },
  { href: '/#temas', label: 'Temas' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const year = 2026;

  return (
    <html lang="es" className={`${manrope.variable} ${jetbrains.variable}`}>
      <body className="flex min-h-screen flex-col bg-bg font-sans text-ink">
        <header className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur">
          <nav
            aria-label="Principal"
            className="mx-auto flex max-w-[96rem] items-center gap-6 px-6 py-3.5"
          >
            <Link
              href="/"
              className="flex shrink-0 items-center gap-2.5 rounded-sm font-semibold tracking-tight"
            >
              <span
                aria-hidden
                className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-[13px] font-bold text-white shadow-sm"
              >
                JIT
              </span>
              Aprendizaje JIT
            </Link>

            <ul className="hidden items-center gap-5 sm:flex">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="rounded-sm text-sm font-medium text-muted transition-colors duration-150 ease-out hover:text-ink"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
              {hasContact && (
                <li>
                  <Link
                    href="/#contacto"
                    className="rounded-sm text-sm font-medium text-muted transition-colors duration-150 ease-out hover:text-ink"
                  >
                    Contacto
                  </Link>
                </li>
              )}
            </ul>

            <Link
              href="/coach"
              className="ml-auto shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition duration-150 ease-out hover:-translate-y-px hover:bg-accent-hover hover:shadow-md"
            >
              Hablar con el coach
            </Link>

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
        <main className="mx-auto w-full max-w-[96rem] flex-1 px-6 py-8 sm:py-12">
          {children}
        </main>

        <footer className="mt-20 border-t border-line bg-surface">
          <div className="mx-auto flex max-w-[96rem] flex-wrap items-center justify-between gap-4 px-6 py-8">
            <div>
              <p className="text-sm font-semibold tracking-tight">Aprendizaje JIT</p>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">
                Coach de aprendizaje justo a tiempo. Responde a lo que te bloquea ahora,
                apoyado en material real.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
              {PROFILE.email && (
                <a
                  href={`mailto:${PROFILE.email}`}
                  className="rounded-sm hover:text-ink"
                >
                  {PROFILE.email}
                </a>
              )}
              {PROFILE.linkedin && (
                <a
                  href={PROFILE.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-sm hover:text-ink"
                >
                  LinkedIn
                </a>
              )}
              <span>© {year} Aprendizaje JIT</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
