import { ImageResponse } from 'next/og';
import { HERO, TAGLINE } from '@/lib/site';

/**
 * The link preview, which is the first impression on the channel this is
 * actually shared on.
 *
 * There was none. `openGraph` carried a title, a description and a locale, and
 * no image — so a link pasted into WhatsApp rendered as a small text-only card.
 * WhatsApp is not incidental here: the pricing page offers it beside email for
 * exactly this market, the floating button is on every page, and the first ten
 * people are going to receive this link in a message rather than find it in a
 * search result.
 *
 * ## Why the claim rather than the logo
 *
 * A preview showing a wordmark says a company exists. This one says what the
 * product does, in the same sentence the page leads with, so the argument
 * survives being forwarded without the page. The tagline underneath answers the
 * only other question a stranger has: what is this thing.
 *
 * Both are read from `site.ts`, so the preview cannot end up quoting a promise
 * the site no longer makes — which is the drift the last four rounds were spent
 * closing everywhere else.
 *
 * Rendered at build time by Next's own image route. No external font, no remote
 * asset, no request cost, and nothing to keep in sync with the palette beyond
 * the three colours below.
 */
export const runtime = 'nodejs';
export const alt = HERO.title;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Straight from `globals.css`: cream paper, deep navy, gold. */
const BG = '#faf8f3';
const INK = '#14130f';
const ACCENT = '#2b4e7e';
const GOLD = '#d9a83b';
const MUTED = '#57544b';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: BG,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: ACCENT,
              display: 'flex',
            }}
          />
          <div style={{ fontSize: 34, fontWeight: 700, color: INK, letterSpacing: -0.5 }}>
            ModoJIT
          </div>
        </div>

        {/*
          The hero, not a slogan written for this image. If the page changes what
          it promises, the preview changes with it.
        */}
        <div
          style={{
            fontSize: 62,
            lineHeight: 1.1,
            color: INK,
            letterSpacing: -1.5,
            maxWidth: 980,
            display: 'flex',
          }}
        >
          {HERO.title}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ width: 96, height: 5, background: GOLD, display: 'flex' }} />
          <div style={{ fontSize: 30, color: MUTED, display: 'flex' }}>{TAGLINE}</div>
        </div>
      </div>
    ),
    size,
  );
}
