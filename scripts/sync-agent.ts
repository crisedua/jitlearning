/**
 * Push the persona in this repo onto the live agent.
 *
 *   npm run sync:agent            # report drift, change nothing
 *   npm run sync:agent -- --push  # apply
 *
 * The persona is source code, but the agent holds its own copy: editing
 * `persona()` or the curriculum changes nothing anyone can hear until it is
 * pushed.
 *
 * Dry by default, and deliberately so. This writes to a live agent that a
 * learner may be talking to right now, so the default run reports the drift and
 * stops; `--push` is the second, explicit decision.
 *
 * The same call re-attaches every indexed document, because the whole prompt
 * block goes out in one PATCH: the knowledge list is not separable from the
 * prompt.
 */
import './env';
import { currentAgent, teacherSystemPrompt, syncAgentKnowledge } from '../src/lib/agent';
import { TEACHER } from '../src/lib/teacher';

/** First line that differs, so a drift report points at something readable. */
function firstDifference(live: string, next: string): string {
  const a = live.split('\n');
  const b = next.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      return `line ${i + 1}\n    live: ${a[i] ?? '(end of prompt)'}\n    repo: ${b[i] ?? '(end of prompt)'}`;
    }
  }
  return 'no textual difference';
}

async function main() {
  if (!process.env.ELEVENLABS_API_KEY) {
    console.error('ELEVENLABS_API_KEY is not set. Copy .env.example to .env.local first.');
    process.exit(1);
  }

  const push = process.argv.includes('--push');
  const agent = await currentAgent();

  if (!agent) {
    console.error(`\n! ${TEACHER.envKey} is not set. Run \`npm run setup:agent\` first.\n`);
    process.exit(1);
  }

  const live = agent.conversation_config.agent.prompt.prompt ?? '';
  const next = teacherSystemPrompt();
  const attached = agent.conversation_config.agent.prompt.knowledge_base?.length ?? 0;

  console.log(`\nAgent:      ${agent.agent_id}`);
  console.log(`Prompt:     live ${live.length} chars · repo ${next.length} chars`);
  console.log(`Documents:  ${attached} attached`);

  const drifted = live !== next;
  if (drifted) console.log(`Drift at ${firstDifference(live, next)}`);
  else console.log('✓ The live persona already matches this repo.');

  if (!push) {
    if (drifted) console.log('\nDry run. Re-run with --push to apply:\n\n  npm run sync:agent -- --push\n');
    return;
  }

  const result = await syncAgentKnowledge();
  console.log(`\n✓ Pushed persona · ${result.attached} document(s) attached\n`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
