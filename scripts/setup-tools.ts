/**
 * Register the teacher's server tools and attach them to the agent.
 *
 *   npm run setup:tools            # report what would change
 *   npm run setup:tools -- --push  # create/update and attach
 *
 * A *server* tool: ElevenLabs calls the deployed app directly, so the browser is
 * never in the loop and a session started from anywhere behaves the same. That
 * also means the URL must be public — this points at production, and a tool
 * registered before the route deploys will fail its first call.
 *
 * There is exactly one tool, and it is the reason the teacher can answer a
 * question about a price or a job posting at all. Everything else it knows comes
 * from the model or from the corpus.
 */
import './env';
import { createTool, listTools, updateAgent, updateTool } from '../src/lib/elevenlabs';
import { currentAgent } from '../src/lib/agent';
import { requireAgentId } from '../src/lib/config';
import { configuredOrigin } from '../src/lib/canonical';

/**
 * Where the deployed route lives.
 *
 * Resolved by `canonical.ts` from `NEXT_PUBLIC_SITE_URL` or `PUBLIC_BASE_URL`,
 * so the tool endpoint, the canonical-host redirect and every URL the app
 * generates come from one setting. The compiled default is the fallback for a
 * deployment that has configured neither, and it is the wrong answer for anybody
 * who forked this — which is why the script prints the URL it is about to
 * register before it registers it.
 */
const BASE_URL = configuredOrigin() ?? 'https://www.modojit.com';

/**
 * The lookup tool.
 *
 * The description is an instruction, not documentation: it is the only thing
 * deciding when the teacher reaches for a search instead of answering from what
 * it knows. So it says *when* to call, names the cases that need it, and names
 * the cases that do not — a teacher that searches before every answer is slower
 * and no more honest.
 *
 * `response_timeout_secs` is 30 because a search-backed answer is not fast. The
 * ElevenLabs default would abandon the call before Claude finished searching,
 * and the agent would report a failure for work that was about to succeed.
 */
const BUSCAR = {
  type: 'webhook' as const,
  name: 'buscar',
  description:
    'Busca en internet y devuelve una respuesta corta con las fuentes que encontró. ' +
    'Úsala cuando la respuesta dependa de información de ahora: precios de una herramienta, ' +
    'qué piden hoy los empleadores de un campo, si un producto todavía existe o cambió, ' +
    'qué versión o función tiene algo, noticias del sector de la persona. ' +
    'Úsala también cuando la persona te corrija diciendo que algo cambió. ' +
    'No la uses para explicar un concepto, para enseñar un paso ni para nada que ya sabes: ' +
    'eso lo respondes tú, y buscar de más solo hace esperar a la persona. ' +
    'Antes de llamarla dile que vas a buscar y que se demora unos segundos. ' +
    'Devuelve `respuesta` (dilo en voz alta con tus palabras) y `fuentes` ' +
    '(nómbralas al citar; nunca leas direcciones web en voz alta).',
  response_timeout_secs: 30,
  api_schema: {
    url: `${BASE_URL}/api/ask`,
    method: 'GET' as const,
    /*
     * The secret rides in a header rather than the query string: this route
     * spends money on every call, and a URL is the part of a request most likely
     * to end up in a log.
     */
    request_headers: [
      {
        type: 'value' as const,
        name: 'x-ingest-secret',
        value: process.env.INGEST_SECRET?.trim() ?? '',
      },
    ],
    query_params_schema: {
      properties: {
        q: {
          type: 'string',
          description:
            'La pregunta a buscar, en español y concreta. Incluye el nombre del producto, ' +
            'el campo o el país si importa. Por ejemplo: "precio de Claude Pro", ' +
            '"qué piden los avisos de analista contable en Chile sobre IA".',
        },
        perfil: {
          type: 'string',
          description:
            'Opcional. El rol y el campo de la persona en pocas palabras, para ajustar la ' +
            'respuesta a su nivel. Por ejemplo: "analista contable, retail, 7 años".',
        },
      },
      required: ['q'],
    },
  },
};

async function main() {
  const push = process.argv.includes('--push');

  if (!process.env.ELEVENLABS_API_KEY?.trim()) {
    console.error('ELEVENLABS_API_KEY is not set. Copy .env.example to .env.local first.');
    process.exit(1);
  }
  if (!process.env.INGEST_SECRET?.trim()) {
    console.error(
      '\nINGEST_SECRET is not set. The tool sends it as a header, and /api/ask refuses\n' +
        'every call without it, so registering the tool now would register a broken one.\n',
    );
    process.exit(1);
  }

  const existing = (await listTools()).tools.find(
    (t) => (t.tool_config as { name?: string } | undefined)?.name === BUSCAR.name,
  );

  console.log(`\nTool:  ${BUSCAR.name}`);
  console.log(`URL:   ${BUSCAR.api_schema.url}`);
  console.log(existing ? `State: exists (${existing.id})` : 'State: not registered yet');

  if (!push) {
    console.log('\nDry run. Re-run with --push to apply:\n\n  npm run setup:tools -- --push\n');
    return;
  }

  // The typed client models client tools; a webhook tool has a different config
  // shape, so the cast is the honest way through rather than widening the shared
  // type for one caller.
  const record = existing
    ? await updateTool(existing.id, BUSCAR as never)
    : await createTool(BUSCAR as never);
  console.log(`✓ ${existing ? 'Updated' : 'Created'} ${record.id}`);

  const agent = await currentAgent();
  if (!agent) {
    console.log('! ELEVENLABS_AGENT_ID is not set, so the tool was not attached to any agent.');
    return;
  }

  const prompt = agent.conversation_config.agent.prompt;
  const attached = new Set(prompt.tool_ids ?? []);
  attached.add(record.id);

  /*
   * `tools` has to go, or the write is rejected.
   *
   * ElevenLabs mirrors attached tools into a deprecated inline `tools` array
   * alongside `tool_ids`, and reading the agent hands back both. Sending them
   * both returns 400 "Cannot specify both tools and tool IDs" — so a
   * read-modify-write of the whole prompt fails on the second run, once the
   * first has populated the legacy field. Only `tool_ids` is written here.
   */
  const { tools: _deprecated, ...rest } = prompt as typeof prompt & { tools?: unknown };

  await updateAgent(requireAgentId(), {
    conversation_config: { agent: { prompt: { ...rest, tool_ids: [...attached] } } },
  });
  console.log(`✓ Attached to ${agent.agent_id}\n`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
