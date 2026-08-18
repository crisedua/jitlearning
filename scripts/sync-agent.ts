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
import {
  currentAgent,
  FIRST_MESSAGE,
  syncAgentKnowledge,
  teacherSystemPrompt,
} from '../src/lib/agent';
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
  /*
   * The persona is pushed to match what this agent can actually do.
   *
   * The lookup tool is attached separately, by `npm run setup:tools -- --push`,
   * which needs INGEST_SECRET. Until that has been run there are no tools, and
   * pushing the persona that says "usa la herramienta buscar" puts a teacher in
   * front of a learner promising a search it cannot run. In a voice call that
   * costs a silence and then an apology, which is worse than never offering.
   *
   * Read from the agent rather than from a flag, so nobody has to remember
   * which one to push: attach the tool and the next sync restores the promise.
   */
  const canSearch = (agent.conversation_config.agent.prompt.tool_ids ?? []).length > 0;
  const next = teacherSystemPrompt({ search: canSearch });
  const attached = agent.conversation_config.agent.prompt.knowledge_base?.length ?? 0;

  console.log(`\nAgent:      ${agent.agent_id}`);
  console.log(`Prompt:     live ${live.length} chars · repo ${next.length} chars`);
  console.log(
    canSearch
      ? 'Search:     tool attached, so the persona keeps its lookup promise'
      : 'Search:     no tool attached, so the persona is pushed without the lookup promise',
  );
  console.log(`Documents:  ${attached} attached`);

  const drifted = live !== next;
  if (drifted) console.log(`Drift at ${firstDifference(live, next)}`);
  else console.log('✓ The live persona already matches this repo.');

  if (!push) {
    if (drifted) console.log('\nDry run. Re-run with --push to apply:\n\n  npm run sync:agent -- --push\n');
    return;
  }

  const result = await syncAgentKnowledge();

  /*
   * Confirm rather than announce.
   *
   * This printed "✓ Pushed persona" on the strength of the request not
   * throwing, which is "we sent it" and not "it is live" — the distinction the
   * doctor's parity check exists for, and the one that matters here because
   * every claim this repo makes about the teacher's behaviour is a claim about
   * the agent, not about the file.
   *
   * A push that is accepted and not applied leaves the operator believing the
   * opposite of the truth, and the only thing that would have told them is a
   * separate command they may not run. Re-reading costs one request.
   */
  const after = await currentAgent();
  const livePrompt = (after?.conversation_config.agent.prompt.prompt ?? '').trim();
  const liveFirst = (after?.conversation_config.agent.first_message ?? '').trim();

  if (livePrompt !== next.trim()) {
    console.error(
      `\n! The push was accepted and the live persona still differs ` +
        `(${livePrompt.length} chars live, ${next.length} here).\n` +
        '  Nothing you change in agent.ts is reaching learners. Try again, and\n' +
        '  check the agent has not been edited in the ElevenLabs dashboard.\n',
    );
    process.exit(1);
  }

  if (liveFirst !== FIRST_MESSAGE) {
    console.error(
      `\n! The persona is live, and the opening line is ${liveFirst ? `"${liveFirst}"` : 'empty'}\n` +
        `  rather than ${FIRST_MESSAGE}. Sessions would not open on the learner's own record.\n`,
    );
    process.exit(1);
  }

  console.log(
    `\n✓ Live and verified · persona ${livePrompt.length} chars · ` +
      `${result.attached} document(s) attached\n`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
