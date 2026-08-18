/**
 * The palette has to stay readable.
 *
 * Every pair below clears WCAG AA today. Nothing was holding it there, and the
 * change that breaks it is not a careless one: it is a shade nudged lighter
 * because it looked better on a bright screen, which passes review and reaches
 * somebody reading their own hours on a phone outdoors.
 *
 * The audience is the argument. This is sold to people learning to work with a
 * computer under time pressure, some of them older, and the text this most
 * applies to is `text-soft` and `text-muted`, which is where the explanations
 * live rather than the headings.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/*
 * The arithmetic lives here rather than in `src/lib`.
 *
 * It is WCAG 2.1 relative luminance and contrast ratio, and nothing but this
 * test has ever called it. A module in `lib` that only its own test imports
 * looks like production code and is not, which is the shape that let a module
 * sit unwired for a day while its commit message said otherwise.
 */
type Rgb = readonly [number, number, number];

function parseHex(hex: string): Rgb {
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
function over(fg: Rgb, bg: Rgb, alpha: number): Rgb {
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

function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The custom properties in `globals.css`, by name without the `--color-` prefix. */
function palette(css: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const m of css.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{3,8})\s*;/gi)) {
    found.set(m[1]!.toLowerCase(), m[2]!);
  }
  return found;
}


const css = readFileSync(
  path.join(import.meta.dirname, '..', 'app', 'globals.css'),
  'utf8',
);
const colours = palette(css);
const rgb = (name: string): Rgb => {
  const hex = colours.get(name);
  assert.ok(hex, `globals.css no longer defines --color-${name}`);
  return parseHex(hex);
};

/** WCAG AA for text under 18pt. Everything here is body copy. */
const AA = 4.5;

const SURFACES = ['bg', 'surface', 'surface-alt'] as const;
/*
 * Every colour the pages actually paint text in.
 *
 * This listed seven and the components use eleven. The four missing ones —
 * brand, accent-hover, accent-deep and body — all pass comfortably, so nothing
 * was wrong; nothing was checking either, which is the same position the palette
 * was in before this file existed.
 *
 * Derived would be better than listed, and is not available: Tailwind writes
 * `text-soft` and the custom property is `--color-soft`, so the mapping is a
 * convention rather than a fact, and a class can be composed at runtime. The
 * test below closes the gap the other way, by failing when a `text-` class names
 * a colour absent from here.
 */
const FOREGROUNDS = [
  'ink',
  'muted',
  'soft',
  'body',
  'accent',
  'accent-hover',
  'accent-deep',
  'brand',
  'success',
  'warning',
  'danger',
] as const;

describe('palette contrast', () => {
  /*
   * The list above has to keep pace with the components.
   *
   * A colour added to the palette and painted as text would otherwise be
   * unchecked, silently, which is how four of them got here. Scanning the JSX
   * for `text-<name>` is crude and it is the only source of truth available:
   * the alternative is remembering, and remembering is what failed.
   */
  it('checks every colour the pages paint text in', () => {
    const dir = path.join(import.meta.dirname, '..');
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        const full = path.join(d, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith('.tsx')) files.push(full);
      }
    };
    walk(dir);

    const painted = new Set<string>();
    for (const file of files) {
      for (const m of readFileSync(file, 'utf8').matchAll(/\btext-([a-z][a-z-]*)\b/g)) {
        if (colours.has(m[1]!)) painted.add(m[1]!);
      }
    }

    /*
     * `bg` is a foreground on the buttons.
     *
     * The primary call to action is `bg-accent text-bg`: the page colour painted
     * on the accent, which is the pair somebody reads on every "empezar" button
     * in the product and which nothing here checked, because the model assumed
     * text sits on a surface. It is checked below, against the button rather
     * than against the page, where comparing it would be meaningless.
     */
    const unchecked = [...painted]
      .filter((c) => c !== 'bg')
      .filter((c) => !FOREGROUNDS.includes(c as never))
      .sort();
    assert.deepEqual(
      unchecked,
      [],
      `painted as text and never checked for contrast: ${unchecked.join(', ')}`,
    );
  });

  it('reads the palette it is meant to check', () => {
    // A rename would otherwise turn every assertion below into a silent pass.
    assert.ok(colours.size >= 12, `only found ${colours.size} colours in globals.css`);
  });

  for (const fg of FOREGROUNDS) {
    for (const bg of SURFACES) {
      it(`${fg} on ${bg} clears AA`, () => {
        const r = contrast(rgb(fg), rgb(bg));
        assert.ok(r >= AA, `${fg} on ${bg} is ${r.toFixed(2)}:1, needs ${AA}`);
      });
    }
  }

  /*
   * The buttons, where the page colour becomes the text colour.
   *
   * `bg-accent text-bg` is the primary call to action on every page, and the
   * white-on-navy pair it produces was checked by nothing: the surfaces above
   * are backgrounds and `bg` was never treated as a foreground.
   */
  const BUTTONS: Array<[string, string]> = [
    ['bg', 'accent'],
    ['bg', 'accent-hover'],
  ];

  for (const [text, button] of BUTTONS) {
    it(`${text} on the ${button} button clears AA`, () => {
      const r = contrast(rgb(text), rgb(button));
      assert.ok(r >= AA, `${text} on ${button} is ${r.toFixed(2)}:1, needs ${AA}`);
    });
  }

  /*
   * The panels as they are actually painted. A tinted background at 50% over
   * cream is not the tint's declared colour, and text at 85% over that is not
   * the ink's, so comparing what globals.css declares would answer a question
   * the page never asks.
   */
  const PANELS: Array<[string, number, string, number]> = [
    ['warning-soft', 0.5, 'ink', 0.8],
    ['warning-soft', 0.6, 'ink', 0.85],
    ['success-soft', 0.7, 'success', 1],
    ['success-soft', 0.4, 'ink', 0.85],
    ['danger-soft', 0.6, 'danger', 1],
    ['danger-soft', 0.6, 'ink', 0.85],
    ['accent-soft', 0.25, 'ink', 0.85],
  ];

  for (const [panel, panelAlpha, text, textAlpha] of PANELS) {
    it(`${text} at ${textAlpha * 100}% on ${panel} at ${panelAlpha * 100}% clears AA`, () => {
      const painted = over(rgb(panel), rgb('bg'), panelAlpha);
      const ink = over(rgb(text), painted, textAlpha);
      const r = contrast(ink, painted);
      assert.ok(r >= AA, `${text} on ${panel} is ${r.toFixed(2)}:1, needs ${AA}`);
    });
  }
});
