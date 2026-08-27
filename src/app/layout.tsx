import type { Metadata } from 'next';
import { Instrument_Sans, Instrument_Serif, JetBrains_Mono } from 'next/font/google';
import Link from 'next/link';
import { BrandMark, Wordmark } from '@/components/BrandMark';
import { StartClassLink } from '@/components/StartClassLink';
import { WhatsAppButton } from '@/components/WhatsAppButton';
import { PROFILE, TAGLINE, hasContact } from '@/lib/site';
import { configuredOrigin, DEFAULT_ORIGIN } from '@/lib/canonical';
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
  /*
   * Absolute URLs for anything a scraper has to fetch.
   *
   * The preview image is served from a relative path, and WhatsApp, Slack and
   * every other unfurler resolve it against this. Without it Next emits a
   * relative URL and the card arrives without its image — which is the whole
   * failure this was added to fix.
   *
   * Resolved from the same place the canonical redirect and the search tool
   * endpoint come from, so one setting keeps them together.
   */
  metadataBase: new URL(configuredOrigin() ?? DEFAULT_ORIGIN),
  /*
   * Which address this page is, for anything that has arrived at another one.
   *
   * `./` resolves per route against `metadataBase`, so every page declares
   * itself rather than the home page declaring itself for all of them. It lands
   * as a canonical link and as `og:url`, which were both missing.
   *
   * It matters here because of how this link travels. It is pasted into
   * WhatsApp, forwarded, retyped from a screenshot, and appended with whatever
   * the last share added, and the deployment answers on the Vercel alias as well
   * as on the domain. Without this, each of those is a separate page to anything
   * that reads the markup, and a preview of one is not a preview of another.
   */
  alternates: { canonical: './' },
  title: 'ModoJIT',
  icons: { icon: '/icono.svg' },
  description: TAGLINE,
  openGraph: {
    title: 'ModoJIT',
    description: TAGLINE,
    type: 'website',
    locale: 'es_CL',
    url: './',
  },
  // Falls back to the OpenGraph image; `summary_large_image` is what makes it
  // render as a picture rather than a thumbnail beside two lines of text.
  twitter: { card: 'summary_large_image', title: 'ModoJIT', description: TAGLINE },
};

/**
 * Anchors live on the home page, so they are prefixed to work from any route.
 * `/planes` is a real page rather than an anchor — it is the one destination
 * here a visitor may arrive at directly, from a link someone sent them.
 */
const NAV = [
  { href: '/#curriculum', label: 'El currículum' },
  { href: '/#como', label: 'Cómo funciona' },
  { href: '/progreso', label: 'Tu progreso' },
  { href: '/planes', label: 'Planes' },
  { href: '/registro', label: 'Registro' },
  { href: '/feedback', label: 'Feedback' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const year = 2026;

  return (
    <html lang="es" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body className="flex min-h-screen flex-col bg-bg font-sans text-ink">
        {/*
          Eight links and buttons stand between the top of every page and the
          content, and a keyboard reaches them one at a time, on every page, on
          every visit. This is one Tab and one Enter instead.

          Hidden until focused rather than hidden outright: `sr-only` takes it
          out of the layout, and the focus classes put it back as a real, visible
          control the moment somebody Tabs into it, which is the only moment it
          is useful and the only moment anybody should see it.

          It matters more here than the count suggests. This is a product for
          people learning to work with a computer under time pressure, some of
          them older, some using magnification — and the first thing after the
          skip is the button the whole page is about.
        */}
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-accent focus:px-5 focus:py-2.5 focus:text-[15px] focus:font-medium focus:text-bg"
        >
          Saltar al contenido
        </a>
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
                  Clases de IA por voz
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

            <StartClassLink />

            {/*
              No link to /knowledge. The route still works for whoever
              administers the corpus — it asks for the ingest secret anyway — but
              it is not part of the learner's navigation.
            */}
          </nav>
        </header>

        <main id="contenido" className="flex-1">
          {children}
        </main>

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
            {/*
              In the footer and not in the header, on purpose.
              
              Somebody deciding whether to open a client's document in front of a
              microphone goes looking for this, and looks at the bottom. Putting
              it in the header would have it competing for attention with the
              button the page exists to get pressed, from people who were not
              asking the question.
            */}
            <Link href="/privacidad" className="rounded-sm hover:text-ink">
              Privacidad
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
