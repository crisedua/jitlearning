/**
 * Generate the knowledge base documents from `src/lib/tutorials.ts`.
 *
 * The agent retrieves prose, the panel renders structured steps. Writing those
 * twice guarantees they drift, and the drift is invisible: the coach narrates
 * step four from an outdated document while the screen draws a different step
 * four. So the prose is generated, never edited by hand.
 *
 * Output lands in `knowledge/tutoriales/`, which is gitignored, and is picked
 * up by `npm run ingest -- ./knowledge`.
 *
 * Each document opens with the tutorial id on its own line. That id is what the
 * agent passes to the `mostrar_tutorial` client tool, so it has to survive
 * retrieval as a literal string the model can read back verbatim.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { TUTORIALS, type Tutorial } from '../src/lib/tutorials';

function render(t: Tutorial): string {
  const lines: string[] = [
    `# ${t.title}`,
    '',
    `Producto: ${t.product}`,
    `Identificador de este tutorial: ${t.id}`,
    '',
    `## Para qué sirve`,
    '',
    t.goal,
    '',
    `## Qué necesitas`,
    '',
    t.requires,
    '',
    `## Lo que más se confunde`,
    '',
    t.keyPoint,
    '',
    `## Pasos`,
    '',
  ];

  t.steps.forEach((s, i) => {
    lines.push(`### Paso ${i + 1}. ${s.title}`, '', s.detail, '');
    if (s.note) {
      // Labelled so a retrieved chunk still says "don't read this out".
      lines.push(`En pantalla (no se lee en voz alta): ${s.note.replace(/\n/g, ' / ')}`, '');
    }
  });

  lines.push(
    '## Procedencia',
    '',
    `Estos pasos se contrastaron con la documentación oficial el ${t.checkedOn}.`,
    `Fuente: ${t.source}`,
    '',
    'Las interfaces cambian sin aviso. Si el nombre de un botón no coincide con lo que ve la persona, guíate por la ubicación y la función descritas, y dilo abiertamente en vez de insistir en el nombre exacto.',
    '',
  );

  return lines.join('\n');
}

const outDir = path.resolve('knowledge/tutoriales');
mkdirSync(outDir, { recursive: true });

for (const t of TUTORIALS) {
  const file = path.join(outDir, `${t.id}.md`);
  writeFileSync(file, render(t), 'utf8');
  console.log(`wrote ${path.relative(process.cwd(), file)} (${t.steps.length} pasos)`);
}

/**
 * An index document. Retrieval is per-chunk, so a question like "¿qué tutoriales
 * tienes?" would otherwise match one tutorial and miss the rest.
 */
const index = [
  '# Tutoriales paso a paso disponibles',
  '',
  'Estos son los tutoriales visuales que el coach puede mostrar en pantalla.',
  'Para mostrar uno, se usa la herramienta mostrar_tutorial con el identificador indicado.',
  '',
  ...TUTORIALS.map(
    (t) => `- ${t.title} (${t.product}). Identificador: ${t.id}. ${t.goal}`,
  ),
  '',
  'Si lo que preguntan no está en esta lista, no hay tutorial visual para eso.',
  'Explícalo de palabra y dilo con claridad, en vez de mostrar un tutorial que trata de otra cosa.',
  '',
].join('\n');

const indexPath = path.join(outDir, 'indice-tutoriales.md');
writeFileSync(indexPath, index, 'utf8');
console.log(`wrote ${path.relative(process.cwd(), indexPath)}`);
