/**
 * Contrast, computed from the palette rather than trusted.
 *
 * The colours here are correct today: every foreground clears 4.5:1 on every
 * surface, and so does every tinted panel the pages actually use. Nothing was
 * holding them there. A shade nudged lighter to look better on a designer's
 * screen is exactly the change that passes review, ships, and costs somebody
 * reading `text-soft` on a phone in daylight.
 *
 * This product is sold to people learning to work with a computer under time
 * pressure, some of them older. Legibility is not a nicety here, and it is the
 * kind of thing that degrades one commit at a time.
 *
 * WCAG 2.1 relative luminance and contrast ratio, which is arithmetic rather
 * than judgement, so it belongs in a test.
 */

export type Rgb = readonly [number, number, number];

export function parseHex(hex: string): Rgb {
  const h = hex.trim().replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ] as const;
}

/**
 * What a colour at `alpha` looks like over another, which is what Tailwind's
 * `/50` modifiers produce. Contrast is a property of what reaches the eye, so
 * comparing the declared colours would answer a question nobody is asking.
 */
export function over(fg: Rgb, bg: Rgb, alpha: number): Rgb {
  return [
    Math.round(fg[0] * alpha + bg[0] * (1 - alpha)),
    Math.round(fg[1] * alpha + bg[1] * (1 - alpha)),
    Math.round(fg[2] * alpha + bg[2] * (1 - alpha)),
  ] as const;
}

function luminance([r, g, b]: Rgb): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The custom properties in `globals.css`, by name without the `--color-` prefix. */
export function palette(css: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const m of css.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{3,8})\s*;/gi)) {
    found.set(m[1]!.toLowerCase(), m[2]!);
  }
  return found;
}
