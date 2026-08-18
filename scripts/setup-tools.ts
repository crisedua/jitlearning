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
import { canSearch, currentAgent, syncAgentKnowledge, teacherSystemPrompt } from '../src/lib/agent';
import { SANDBOX_TOOL } from '../src/lib/practica';
import { requireAgentId } from '../src/lib/config';
import { configuredOrigin, DEFAULT_ORIGIN } from '../src/lib/canonical';

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
const BASE_URL = configuredOrigin() ?? DEFAULT_ORIGIN;

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

/**
 * Both tools, and why the secret gates only one of them.
 *
 * `buscar` is a webhook: ElevenLabs calls our deployed route and carries
 * INGEST_SECRET as a header, so registering it without the secret registers a
 * tool that answers 503 to every call — a failure the learner hears.
 *
 * `open_model_sandbox` is a client tool. ElevenLabs relays it to the browser
 * over the open socket, nothing on our side is called, and it needs no secret
 * at all. Bundling them behind one guard, which is what this script used to do,
 * meant a deployment missing INGEST_SECRET could register neither — including
 * the one that does not need it.
 */
const TOOLS = [
  { config: BUSCAR, needsSecret: true, where: BUSCAR.api_schema.url },
  { config: SANDBOX_TOOL, needsSecret: false, where: 'the browser (client tool)' },
];

/**
 * Whether the deployed route can actually authenticate a call.
 *
 * Sent deliberately without the secret, because the two failures we need to
 * tell apart are both refusals: 503 means the server has no secret configured
 * and every tool call would fail, 401 means it has one and simply rejected this
 * unsigned probe, which is the answer we want.
 *
 * Unreachable is treated as not-ready. Registering a tool against a URL that
 * does not answer is how a class ends up announcing a search into silence, and
 * a run that is merely deferred costs nothing.
 */
async function deployedSecretWorks(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'GET' });
    if (res.status === 401) return true;
    if (res.status === 503) return false;
    /*
     * A 200 means the route answered without a secret at all, which it should
     * never do. Treated as not-ready rather than as success: something is wrong
     * with the gate, and attaching a billable tool to it is the wrong response.
     */
    console.error(`  (${url} answered ${res.status} to an unsigned probe, which is unexpected.)`);
    return false;
  } catch {
    return false;
  }
}

async function main() {
  const push = process.argv.includes('--push');

  if (!process.env.ELEVENLABS_API_KEY?.trim()) {
    console.error('ELEVENLABS_API_KEY is not set. Copy .env.example to .env.local first.');
    process.exit(1);
  }

  /*
   * The secret has to be on the *deployment*, not on this laptop.
   *
   * This checked `process.env.INGEST_SECRET` and registered a tool pointing at
   * production, which are two different machines and, on this project, two
   * different answers: the secret has been in `.env.local` the whole time and
   * has never been set in Vercel. So the check passed, the tool would have been
   * registered, and every call it made would have returned 503 — the exact
   * failure the check exists to prevent, verified against the wrong computer.
   *
   * `/api/ask` distinguishes the two cases without needing the secret: 503 when
   * the server has none configured, 401 when it has one and we did not send it.
   * A 401 is therefore the healthy answer here.
   */
  const secretIsDeployed = await deployedSecretWorks(BUSCAR.api_schema.url);
  const wanted = TOOLS.filter((t) => secretIsDeployed || !t.needsSecret);

  if (!secretIsDeployed) {
    console.error(
      `\n! ${BUSCAR.api_schema.url} has no INGEST_SECRET, so \`buscar\` is being skipped.\n` +
        '  It sends the secret as a header and that route refuses every call without one,\n' +
        '  so registering it now would register a tool that answers 503 mid-class — which\n' +
        '  the learner hears as the teacher announcing a search and then apologising.\n' +
        '  Set INGEST_SECRET in the Vercel project settings, redeploy, and run this again.\n' +
        '  The sandbox tool needs no secret and is handled below.\n',
    );
  }

  const registry = (await listTools()).tools;
  const found = new Map(
    wanted.map((t) => [
      t.config.name,
      registry.find((r) => (r.tool_config as { name?: string } | undefined)?.name === t.config.name),
    ]),
  );

  for (const tool of wanted) {
    const existing = found.get(tool.config.name);
    console.log(`\nTool:  ${tool.config.name}`);
    console.log(`Runs:  ${tool.where}`);
    console.log(existing ? `State: exists (${existing.id})` : 'State: not registered yet');
  }

  if (!push) {
    console.log('\nDry run. Re-run with --push to apply:\n\n  npm run setup:tools -- --push\n');
    return;
  }

  const ids: string[] = [];
  for (const tool of wanted) {
    const existing = found.get(tool.config.name);
    // The typed client models client tools; a webhook tool has a different
    // config shape, so the cast is the honest way through rather than widening
    // the shared type for one caller.
    const record = existing
      ? await updateTool(existing.id, tool.config as never)
      : await createTool(tool.config as never);
    ids.push(record.id);
    console.log(`✓ ${existing ? 'Updated' : 'Created'} ${tool.config.name} (${record.id})`);
  }

  const agent = await currentAgent();
  if (!agent) {
    console.log('! ELEVENLABS_AGENT_ID is not set, so nothing was attached to any agent.');
    return;
  }

  const prompt = agent.conversation_config.agent.prompt;
  const attached = new Set(prompt.tool_ids ?? []);
  for (const id of ids) attached.add(id);

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

  /*
   * Confirm the attachment rather than announce it.
   *
   * This printed "✓ Attached" because `updateAgent` did not throw, and the write
   * it makes is the fiddliest in this repo: ElevenLabs mirrors attached tools
   * into a deprecated inline `tools` array beside `tool_ids`, sending both is a
   * 400, and the strip above is what keeps the second run from failing. A write
   * that is accepted and lands differently is exactly the shape that produces.
   *
   * The failure it hides is the one this whole script exists to fix. The persona
   * tells learners it can search; with no tool attached it announces a search it
   * cannot make. An operator who ran this and was told it worked would have no
   * reason to look again.
   */
  const after = await currentAgent();
  const live = new Set(after?.conversation_config.agent.prompt.tool_ids ?? []);

  const missing = ids.filter((id) => !live.has(id));
  if (missing.length > 0) {
    console.error(
      `\n! The update was accepted and ${missing.join(', ')} is not attached to ${agent.agent_id}.\n` +
        '  A missing `buscar` means the persona promises a search nothing can answer; a missing\n' +
        '  `open_model_sandbox` means the teacher can never open the practice panel.\n' +
        '  Check the agent in the ElevenLabs dashboard before sending anybody to it.\n',
    );
    process.exit(1);
  }

  console.log(`✓ Attached and verified · ${live.size} tool(s) on ${agent.agent_id}`);

  /*
   * Put the search promise back, because attaching a tool does not.
   *
   * The persona ships in two forms and `syncAgentKnowledge` picks by the agent's
   * `tool_ids`. Anybody following the order in the README has already synced,
   * with no tool attached, so the live prompt says plainly that it cannot look
   * anything up. That was correct one line ago and is now a teacher refusing to
   * use something it has.
   *
   * Doing it here rather than telling the operator to, because the failure is
   * silent: nothing errors, no check fails except the one comparing the live
   * persona to the variant its tools imply, and every class in between is taught
   * by a teacher that declines to search. A script that changes what the agent
   * can do should leave the agent describing itself correctly.
   */
  const synced = await syncAgentKnowledge();
  const check = await currentAgent();
  const livePrompt = (check?.conversation_config.agent.prompt.prompt ?? '').trim();

  /*
   * Which variant to expect is now a question, not a constant. `buscar` may
   * have been skipped for a missing secret, in which case the correct live
   * persona is the one that makes no lookup promise — and asserting the
   * searching one would fail a run that did exactly the right thing.
   */
  const searching = await canSearch([...live]);

  if (livePrompt !== teacherSystemPrompt({ search: searching }).trim()) {
    console.error(
      '\n! The tool is attached and the live persona is not the one that uses it.\n' +
        '  Run `npm run sync:agent -- --push` and read what it says.\n',
    );
    process.exit(1);
  }

  console.log(
    `✓ Persona re-synced ${searching ? 'with' : 'without'} its lookup promise · ` +
      `${livePrompt.length} chars · ${synced.attached} document(s)\n`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
