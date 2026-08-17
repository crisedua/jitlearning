/**
 * One-time provisioning: creates the teacher's agent and prints its id.
 *
 *   npm run setup:agent
 *   npm run setup:agent -- --force    # create another one anyway
 *
 * The id is not written anywhere. Copy it into `.env.local` and into your Vercel
 * project settings; keeping it env-only is what lets every serverless instance
 * stay stateless.
 */
import './env';
import { provisionAgent } from '../src/lib/agent';
import { agentId } from '../src/lib/config';
import { TEACHER } from '../src/lib/teacher';

async function main() {
  if (!process.env.ELEVENLABS_API_KEY) {
    console.error('ELEVENLABS_API_KEY is not set. Copy .env.example to .env.local first.');
    process.exit(1);
  }

  const force = process.argv.includes('--force');
  const existing = agentId();

  if (existing && !force) {
    console.log(`\n${TEACHER.envKey} is already set (${existing}).`);
    console.log('Pass --force to create an additional agent anyway.\n');
    return;
  }

  const id = await provisionAgent();

  console.log('\n✓ Agent created. Set this in .env.local and in your Vercel environment:\n');
  console.log(`  ${TEACHER.envKey}=${id}\n`);
  console.log('Then run `npm run ingest -- ./knowledge` — it starts with an empty knowledge base.\n');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
