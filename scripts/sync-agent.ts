/**
 * Push the personas in this repo onto the live agents.
 *
 *   npm run sync:agent                       # every coach, report only
 *   npm run sync:agent -- colegios           # just this one, report only
 *   npm run sync:agent -- --push             # every coach, applied
 *   npm run sync:agent -- colegios --push
 *
 * The persona is source code, but each agent holds its own copy: editing a
 * coach's `scope` or the shared core changes nothing anyone can hear until it
 * is pushed. Note that a change to the *core* affects every coach, so the
 * default run without a slug reports drift across all of them.
 *
 * Dry by default, and deliberately so. This writes to live agents that learners
 * may be talking to right now, so the default run reports the drift and stops;
 * `--push` is the second, explicit decision.
 *
 * The same call also re-attaches every indexed document that belongs to the
 * coach, because `syncAgentKnowledge` writes the whole prompt block at once —
 * the knowledge list is not separable from the prompt in one PATCH.
 */
import './env';
import { currentAgent, tutorSystemPrompt, syncAgentKnowledge } from '../src/lib/agent';
import { availableCoaches, findCoach, type Coach } from '../src/lib/coaches';

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

/** Returns true if this coach needs a push, so the summary can be honest. */
async function syncOne(coach: Coach, push: boolean): Promise<boolean> {
  const agent = await currentAgent(coach);
  console.log(`\n${coach.label}`);

  if (!agent) {
    console.log(
      `  ! ${coach.envKey} is not set. Run \`npm run setup:agent -- ${coach.id}\` first.`,
    );
    return true;
  }

  const live = agent.conversation_config.agent.prompt.prompt ?? '';
  const next = tutorSystemPrompt(coach);
  const attached = agent.conversation_config.agent.prompt.knowledge_base?.length ?? 0;

  console.log(`  Agent:      ${agent.agent_id}`);
  console.log(`  Prompt:     live ${live.length} chars · repo ${next.length} chars`);
  console.log(`  Documents:  ${attached} attached`);

  const drifted = live !== next;
  if (drifted) console.log(`  Drift at ${firstDifference(live, next)}`);
  else console.log('  ✓ The live persona already matches this repo.');

  if (!push) return drifted;

  const result = await syncAgentKnowledge(coach);
  console.log(`  ✓ Pushed persona · ${result.attached} document(s) attached`);
  return false;
}

async function main() {
  if (!process.env.ELEVENLABS_API_KEY) {
    console.error('ELEVENLABS_API_KEY is not set. Copy .env.example to .env.local first.');
    process.exit(1);
  }

  const push = process.argv.includes('--push');
  const slug = process.argv.slice(2).find((a) => !a.startsWith('--'));

  let targets: readonly Coach[];
  if (slug) {
    const coach = findCoach(slug);
    if (!coach || !coach.available) {
      console.error(
        `Unknown coach "${slug}". Available: ${availableCoaches()
          .map((c) => c.id)
          .join(', ')}`,
      );
      process.exit(1);
    }
    targets = [coach];
  } else {
    targets = availableCoaches();
  }

  let pending = 0;
  for (const coach of targets) {
    if (await syncOne(coach, push)) pending += 1;
  }

  if (!push && pending > 0) {
    console.log(`\nDry run · ${pending} coach(es) would change. Re-run with --push:\n`);
    console.log(`  npm run sync:agent -- ${slug ? `${slug} ` : ''}--push\n`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
