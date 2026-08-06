import type { Metadata } from 'next';
import { Instrument_Sans, Instrument_Serif, JetBrains_Mono } from 'next/font/google';
import Link from 'next/link';
import { BrandMark, Wordmark } from '@/components/BrandMark';
import { WhatsAppButton } from '@/components/WhatsAppButton';
import { PROFILE, hasContact } from '@/lib/site';
import './globals.css';

/**
 * Three typefaces, each with a job. Instrument Sans runs the interface;
 * Instrument Serif carries the headlines, where the italic does the work a
 * second weight would otherwise do; JetBrains Mono is reserved for things a
 * learner must copy exactly — commands, ids, step numbers — where a humanist
 * face makes `l` and `1` ambiguous.
 */
const sans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-instrument-sans',
  display: 'swap',
});

const serif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument-serif',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ModoJIT',
  icons: { icon: '/icono.svg' },
  description: 'Coach de aprendizaje justo a tiempo con agentes de voz de ElevenLabs y RAG',
};

/**
 * Anchors live on the home page, so they are prefixed to work from any route.
 * `/planes` is a real page rather than an anchor — it is the one destination
 * here a visitor may arrive at directly, from a link someone sent them.
 */
const NAV = [
  { href: '/#que-hace', label: 'Qué hace' },
  { href: '/#diferencia', label: 'La diferencia' },
  { href: '/#temas', label: 'Temas' },
  { href: '/#como', label: 'Cómo funciona' },
  { href: '/planes', label: 'Planes' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const year = 2026;

  return (
    <html lang="es" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body className="flex min-h-screen flex-col bg-bg font-sans text-ink">
        {/*
          Reading progress. Purely decorative, and driven entirely by the scroll
          timeline — where that is unsupported the bar simply sits full-width
          and inert rather than misreporting position.
        */}
        <div
          aria-hidden
          className="fixed inset-x-0 top-0 z-[60] h-[3px] origin-left bg-gradient-to-r from-accent to-gold [animation-range:0_100%] [animation-timeline:scroll(root)] [animation:wipe_linear_both]"
        />

        <header className="sticky top-0 z-50 border-b border-line bg-bg/85 backdrop-blur-md">
          <nav
            aria-label="Principal"
            className="mx-auto flex max-w-[75rem] items-center gap-6 px-6 py-3.5 sm:gap-7"
          >
            <Link
              href="/"
              className="flex shrink-0 items-center gap-3 rounded-sm text-[21px] font-semibold tracking-[-0.01em]"
            >
              <BrandMark size={36} />

              {/* The wordmark and its tagline stack, so the mark stays centred
                  against both lines rather than against the wordmark alone. */}
              <span className="flex flex-col gap-[3px]">
                <span className="flex items-center gap-3">
                  {/* The mark alone carries the brand on a phone; the wordmark
                      plus the call to action do not fit side by side at 320px. */}
                  <Wordmark className="hidden xs:inline-flex" />
                  {/* Always visible, even where the wordmark is not: the label is
                      a promise about the product's maturity, not part of the brand. */}
                  <span className="rounded-full border border-gold/45 bg-gold-soft/40 px-2 py-[3px] text-[10px] font-semibold uppercase leading-none tracking-[0.1em] text-accent">
                    Beta
                  </span>
                </span>

                {/* Hidden wherever the wordmark is, since with the mark alone it
                    would be a tagline under nothing. `aria-hidden` because the
                    link is already named by the wordmark — a screen reader
                    should hear "ModoJIT", not the whole slogan, on every page. */}
                <span
                  aria-hidden
                  className="hidden text-[9.5px] font-semibold uppercase leading-none tracking-[0.13em] text-soft xs:block"
                >
                  Aprendizaje justo a tiempo
                </span>
              </span>
            </Link>

            <ul className="hidden items-center gap-6 md:flex">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="rounded-sm border-b border-transparent pb-1 text-[15px] text-muted transition-colors duration-200 ease-out hover:border-gold hover:text-ink"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
              {hasContact && (
                <li>
                  <Link
                    href="/#contacto"
                    className="rounded-sm border-b border-transparent pb-1 text-[15px] text-muted transition-colors duration-200 ease-out hover:border-gold hover:text-ink"
                  >
                    Contacto
                  </Link>
                </li>
              )}
            </ul>

            <Link
              href="/coach"
              className="ml-auto inline-flex shrink-0 items-center gap-2.5 rounded-full bg-accent px-5 py-2.5 text-[15px] font-medium text-bg transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-accent-hover"
            >
              {/* One flex item, or the parent's gap opens between the two words. */}
              <span>
                Hablar<span className="hidden xs:inline"> con el coach</span>
              </span>
              <span
                aria-hidden
                className="h-[7px] w-[7px] rounded-full bg-gold [animation:ring_2.2s_ease-out_infinite]"
              />
            </Link>

            {/*
              No link to /knowledge. The route still works for whoever
              administers the corpus — it asks for the ingest secret anyway — but
              it is not part of the learner's navigation.
            */}
          </nav>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-line py-9">
          <div className="mx-auto flex max-w-[75rem] flex-wrap items-center gap-x-6 gap-y-3 px-6 text-sm text-soft">
            <span className="flex items-center gap-2.5 text-[17px] font-semibold text-ink">
              <BrandMark size={28} />
              <Wordmark />
            </span>
            <span className="flex-1" />
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-sm hover:text-ink">
                {item.label}
              </Link>
            ))}
            <Link href="/feedback" className="rounded-sm hover:text-ink">
              Feedback
            </Link>
            {PROFILE.email && (
              <a href={`mailto:${PROFILE.email}`} className="rounded-sm hover:text-ink">
                {PROFILE.email}
              </a>
            )}
            <span>© {year}</span>
          </div>
        </footer>

        <WhatsAppButton />
      </body>
    </html>
  );
}
