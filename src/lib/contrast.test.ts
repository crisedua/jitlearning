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
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { contrast, over, palette, parseHex, type Rgb } from './contrast';

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
const FOREGROUNDS = ['ink', 'muted', 'soft', 'accent', 'success', 'warning', 'danger'] as const;

describe('palette contrast', () => {
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
