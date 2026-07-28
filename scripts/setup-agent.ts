/**
 * One-time provisioning: creates the tutor agent and prints its id.
 *
 *   npm run setup:agent
 *
 * The id is not written anywhere — copy it into ELEVENLABS_AGENT_ID locally and
 * in your Vercel project settings. Keeping it env-only is what lets every
 * serverless instance stay stateless.
 */
import './env';
import { provisionAgent } from '../src/lib/agent';
import { agentId } from '../src/lib/config';

async function main() {
  if (!process.env.ELEVENLABS_API_KEY) {
    console.error('ELEVENLABS_API_KEY is not set. Copy .env.example to .env.local first.');
    process.exit(1);
  }

  const existing = agentId();
  if (existing && !process.argv.includes('--force')) {
    console.log(`ELEVENLABS_AGENT_ID is already set: ${existing}`);
    console.log('Pass --force to create an additional agent.');
    return;
  }

  const id = await provisionAgent();
  console.log(`\n✓ Agent created: ${id}\n`);
  console.log('Set this in .env.local and in your Vercel environment variables:\n');
  console.log(`  ELEVENLABS_AGENT_ID=${id}\n`);
  console.log('Then upload knowledge — the agent starts with an empty knowledge base.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
