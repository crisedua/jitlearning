/**
 * One-time provisioning: creates a coach's agent and prints its id.
 *
 *   npm run setup:agent                 # every coach that has no id yet
 *   npm run setup:agent -- colegios     # just this one
 *   npm run setup:agent -- colegios --force
 *
 * One agent per coach, because the attachment list is per-agent and that list
 * is what keeps each coach inside its own corpus.
 *
 * Ids are not written anywhere — copy them into `.env.local` and into your
 * Vercel project settings. Keeping them env-only is what lets every serverless
 * instance stay stateless.
 */
import './env';
import { provisionAgent } from '../src/lib/agent';
import { agentId } from '../src/lib/config';
import { availableCoaches, findCoach, type Coach } from '../src/lib/coaches';

async function main() {
  if (!process.env.ELEVENLABS_API_KEY) {
    console.error('ELEVENLABS_API_KEY is not set. Copy .env.example to .env.local first.');
    process.exit(1);
  }

  const force = process.argv.includes('--force');
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

  const created: Array<{ coach: Coach; id: string }> = [];

  for (const coach of targets) {
    const existing = agentId(coach);
    if (existing && !force) {
      console.log(`· ${coach.label}: ${coach.envKey} already set (${existing})`);
      continue;
    }

    const id = await provisionAgent(coach);
    created.push({ coach, id });
    console.log(`✓ ${coach.label}: agent created`);
  }

  if (created.length === 0) {
    console.log('\nNothing to do. Pass --force to create additional agents.');
    return;
  }

  console.log('\nSet these in .env.local and in your Vercel environment variables:\n');
  for (const { coach, id } of created) console.log(`  ${coach.envKey}=${id}`);
  console.log(
    '\nThen run `npm run ingest -- ./knowledge` — the agents start with an empty knowledge base.',
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
