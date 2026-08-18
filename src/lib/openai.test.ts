import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { estimateUsd } from './openai';

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8');

describe('what a radar run costs', () => {
  it('is dominated by the searches, not the model', () => {
    const tokens = estimateUsd({ input_tokens: 20_000, output_tokens: 10_000 }, 0);
    const withSearches = estimateUsd(
      { input_tokens: 20_000, output_tokens: 10_000 },
      50,
    );
    assert.ok(withSearches - tokens > tokens * 5, 'search is meant to be the expensive half');
  });

  it('charges nothing for a run that did nothing', () => {
    assert.equal(estimateUsd({ input_tokens: 0, output_tokens: 0 }, 0), 0);
  });

  /*
   * The operator is told a number before they press a button that spends their
   * money. That number lives in the component and the arithmetic lives here, so
   * nothing but this test keeps them together.
   *
   * The direction matters more than the precision: a warning may overstate the
   * bill, never understate it. Five scans at the top of the prompt's own budget
   * of "entre 8 y 14 búsquedas" is the realistic worst case, and it came to one
   * cent over the US$0,75 the button used to promise. It is an upper bound now,
   * with the real figure reported after the run, because a number somebody
   * spends money against should bound the bill rather than approximate it.
   */
  it('is never more than the button warns before it is pressed', () => {
    const scan = { input_tokens: 3_000, output_tokens: 4_000 };
    const curate = { input_tokens: 22_000, output_tokens: 6_000 };
    const worstCase = 5 * estimateUsd(scan, 14) + estimateUsd(curate, 0);

    const button = read('src', 'components', 'RadarLlmButton.tsx');
    const quoted = button.match(/Cuesta menos de US\$(\d+)(?:,(\d+))? por corrida/);
    assert.ok(quoted, 'the button no longer bounds what a run costs');
    const quotedUsd = Number(`${quoted[1]}.${quoted[2] ?? 0}`);

    assert.ok(
      quotedUsd >= worstCase,
      `the button promises US$${quotedUsd} and a run can reach US$${worstCase.toFixed(2)}`,
    );
  });

  it('says the price is an estimate rather than an invoice', () => {
    assert.match(read('src', 'lib', 'openai.ts'), /no(t| es) una? (invoice|factura)|not an invoice/i);
  });
});
