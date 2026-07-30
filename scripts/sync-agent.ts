/**
 * Push the persona in this repo onto the live agent.
 *
 *   npm run sync:agent          # show what would change, touch nothing
 *   npm run sync:agent -- --push
 *
 * The persona is source code, but the agent holds its own copy: editing
 * `TUTOR_PERSONA` changes nothing anyone can hear until it is pushed. Until now
 * the only way to push was `POST /api/agent` against a deployment, which means
 * a prompt change could not be tested without shipping it first.
 *
 * Dry by default, and deliberately so. This writes to a live agent that
 * learners may be talking to right now, so the default run reports the drift
 * and stops; `--push` is the second, explicit decision.
 *
 * The same call also re-attaches every indexed document, because
 * `syncAgentKnowledge` writes the whole prompt block at once — the knowledge
 * list is not separable from the prompt in one PATCH.
 */
import './env';
import { currentAgent, tutorSystemPrompt, syncAgentKnowledge } from '../src/lib/agent';

/** First line that differs, so a drift report points at something readable. */
function firstDifference(live: string, next: string): string {
  const a = live.split('\n');
  const b = next.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      return `line ${i + 1}\n  live: ${a[i] ?? '(end of prompt)'}\n  repo: ${b[i] ?? '(end of prompt)'}`;
    }
  }
  return 'no textual difference';
}

async function main() {
  if (!process.env.ELEVENLABS_API_KEY) {
    console.error('ELEVENLABS_API_KEY is not set. Copy .env.example to .env.local first.');
    process.exit(1);
  }

  const agent = await currentAgent();
  if (!agent) {
    console.error('ELEVENLABS_AGENT_ID is not set. Run `npm run setup:agent` first.');
    process.exit(1);
  }

  const live = agent.conversation_config.agent.prompt.prompt ?? '';
  const next = tutorSystemPrompt();
  const attached = agent.conversation_config.agent.prompt.knowledge_base?.length ?? 0;

  console.log(`Agent:      ${agent.agent_id}${agent.name ? ` (${agent.name})` : ''}`);
  console.log(`Prompt:     live ${live.length} chars · repo ${next.length} chars`);
  console.log(`Documents:  ${attached} attached\n`);

  if (live === next) {
    console.log('✓ The live persona already matches this repo.');
    if (!process.argv.includes('--push')) return;
    console.log('  Pushing anyway to re-attach documents.\n');
  } else {
    console.log(`Drift at ${firstDifference(live, next)}\n`);
    if (!process.argv.includes('--push')) {
      console.log('Dry run. Re-run with --push to apply:\n');
      console.log('  npm run sync:agent -- --push\n');
      return;
    }
  }

  const result = await syncAgentKnowledge();
  console.log(`✓ Pushed persona to ${result.agentId}`);
  console.log(`✓ ${result.attached} document(s) attached`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
