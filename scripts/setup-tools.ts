/**
 * Register the coach's server tools and attach them to their agents.
 *
 *   npm run setup:tools            # report what would change
 *   npm run setup:tools -- --push  # create/update and attach
 *
 * A *server* tool, not a client one: ElevenLabs calls the deployed app
 * directly, so the browser is not in the loop and a session started from
 * anywhere gets the same answer. That also means the URL must be public — this
 * points at production, and a tool registered before the route deploys will
 * simply fail its first call.
 *
 * Only `emprendedores` gets the pain search: the table is founder material,
 * and a tool on an agent whose corpus cannot support it is how a coach starts
 * answering outside its own subject.
 */
import './env';
import { createTool, listTools, updateAgent, updateTool } from '../src/lib/elevenlabs';
import { findCoach } from '../src/lib/coaches';
import { currentAgent } from '../src/lib/agent';
import { requireAgentId } from '../src/lib/config';

/** Where the deployed route lives. Override for a preview deployment. */
const BASE_URL = process.env.PUBLIC_BASE_URL?.trim() || 'https://www.modojit.com';

const PAIN_SEARCH = {
  type: 'webhook' as const,
  name: 'buscar_dolores',
  description:
    'Busca en un radar de quejas reales recogidas de foros públicos (Reddit) qué problemas ' +
    'está describiendo la gente sobre un rubro, oficio o tema. Úsala cuando alguien busque una ' +
    'idea de negocio, quiera saber de qué se queja la gente en un sector, o quiera contrastar ' +
    'si un dolor que tiene en mente también lo sufren otros. Devuelve citas textuales con su ' +
    'foro y su enlace. No es validación: es evidencia de dónde mirar.',
  response_timeout_secs: 8,
  api_schema: {
    url: `${BASE_URL}/api/pain-search`,
    method: 'GET' as const,
    query_params_schema: {
      properties: {
        q: {
          type: 'string',
          description:
            'El tema, rubro u oficio a buscar, en español y en pocas palabras. Por ejemplo: ' +
            '"cobros a clientes", "restaurantes", "facturas vencidas", "seguimiento de clientes".',
        },
        pais: {
          type: 'string',
          description:
            'Opcional. Código de dos letras del país si la persona pregunta por su mercado: ' +
            'CL, AR, MX, ES, UY, CO, PE, BO. Omítelo si no lo mencionó.',
        },
      },
      required: ['q'],
    },
  },
};

async function main() {
  const push = process.argv.includes('--push');

  const existing = (await listTools()).tools.find(
    (t) => (t.tool_config as { name?: string } | undefined)?.name === PAIN_SEARCH.name,
  );

  console.log(`Tool:  ${PAIN_SEARCH.name}`);
  console.log(`URL:   ${PAIN_SEARCH.api_schema.url}`);
  console.log(existing ? `State: exists (${existing.id})` : 'State: not registered yet');

  if (!push) {
    console.log('\nDry run. Re-run with --push to apply:\n\n  npm run setup:tools -- --push');
    return;
  }

  // The typed client models client tools; a webhook tool has a different
  // config shape, so the cast is the honest way through rather than widening
  // the shared type for one caller.
  const record = existing
    ? await updateTool(existing.id, PAIN_SEARCH as never)
    : await createTool(PAIN_SEARCH as never);
  console.log(`✓ ${existing ? 'Updated' : 'Created'} ${record.id}`);

  const coach = findCoach('emprendedores');
  if (!coach) throw new Error('The emprendedores coach is missing from the registry.');

  const agent = await currentAgent(coach);
  if (!agent) {
    console.log(`! ${coach.envKey} is not set, so the tool was not attached to any agent.`);
    return;
  }

  const prompt = agent.conversation_config.agent.prompt;
  const attached = new Set(prompt.tool_ids ?? []);
  attached.add(record.id);

  /*
   * `tools` has to go, or the write is rejected.
   *
   * ElevenLabs mirrors attached tools into a deprecated inline `tools` array
   * alongside `tool_ids`, and reading the agent hands both back. Sending them
   * both returns 400 "Cannot specify both tools and tool IDs" — so a
   * read-modify-write of the whole prompt fails on the second run, once the
   * first has populated the legacy field. Only `tool_ids` is written here.
   */
  const { tools: _deprecated, ...rest } = prompt as typeof prompt & { tools?: unknown };

  await updateAgent(requireAgentId(coach), {
    conversation_config: {
      agent: { prompt: { ...rest, tool_ids: [...attached] } },
    },
  });
  console.log(`✓ Attached to ${coach.label} (${agent.agent_id})`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
