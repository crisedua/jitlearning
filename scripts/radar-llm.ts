/**
 * Run the LLM radar: web-search discovery of first-person business pains,
 * curated and stored into `pain_signals`.
 *
 *   npm run radar                     # todos los mercados
 *   npm run radar -- --scope cl      # Chile primero
 *   npm run radar -- --scope latam   # Latinoamérica
 *   npm run radar -- --dry           # reporta sin escribir
 *
 * Complements `scrape:pains` (Apify) rather than replacing it: this path
 * costs OpenAI tokens instead of Apify credit, filters with prompt rules and
 * a scoring gate instead of keyword lists, and verifies every URL before
 * storing. Both write the same table through the same store.
 */
import './env';
import { runRadarLlm, RADAR_SCOPES, type RadarScope } from '../src/lib/radar-llm';
import { storePainSignals } from '../src/lib/pains-store';
import { openaiConfigured } from '../src/lib/openai';

function parseScope(args: string[]): RadarScope {
  const i = args.indexOf('--scope');
  const value = i >= 0 ? args[i + 1] : 'all';
  if (value && value in RADAR_SCOPES) return value as RadarScope;
  console.error(`Scope "${value}" no existe. Opciones: ${Object.keys(RADAR_SCOPES).join(', ')}`);
  process.exit(1);
}

async function main() {
  if (!openaiConfigured()) {
    console.error('OPENAI_API_KEY no está en .env.local — el radar IA no puede correr.');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const scope = parseScope(args);

  const result = await runRadarLlm({ scope, log: (line) => console.log(line) });

  console.log(`\n${result.signals.length} señal(es) nuevas, ${result.dropped} descartadas:\n`);
  for (const s of result.signals.slice(0, 12)) {
    const where = [s.community, s.country].filter(Boolean).join(' · ');
    console.log(`  · [${where}] (${s.verdict}) ${s.title.slice(0, 78)}`);
  }
  if (result.signals.length > 12) console.log(`  … y ${result.signals.length - 12} más`);
  for (const note of result.notes) console.log(`\n! ${note}`);

  const { stored, error } = await storePainSignals(result.signals, { dry });
  if (error) console.error('\n!', error);
  console.log(dry ? '\nDry run: nada escrito.' : `\n✓ ${stored} fila(s) guardadas y publicadas.`);

  console.log(
    `OpenAI: ~US$${result.usage.estimatedUsd.toFixed(2)} esta corrida ` +
      `(entrada ${(result.usage.inputTokens / 1000).toFixed(0)}k tok, ` +
      `salida ${(result.usage.outputTokens / 1000).toFixed(0)}k tok, ` +
      `${result.usage.webSearches} búsquedas web)`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
