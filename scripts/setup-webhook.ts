/**
 * Register the post-call webhook, which is what makes a class worth having.
 *
 *   npm run setup:webhook            # report what exists, change nothing
 *   npm run setup:webhook -- --push  # create it and point ElevenLabs at it
 *
 * ## What breaks without it
 *
 * A conversation ends and ElevenLabs has nowhere to send the transcript. So no
 * `session_summaries` row is written, no plan step is marked done, no
 * `minutes_before` or `minutes_after` is recorded, and no commitment is kept.
 *
 * `timeSaved()` counts only weekly steps that are done and carry both numbers,
 * so with no webhook the notebook stays empty, the weekly saving stays zero,
 * and the offer that the whole product builds toward never appears for anybody.
 * The teacher can reach the subtraction and say it out loud, and the moment the
 * call ends it is gone.
 *
 * It is silent in the way that looks like nothing is wrong. Classes connect,
 * the teacher works, nobody sees an error.
 *
 * ## Why a script and not the dashboard
 *
 * The dashboard route is two screens plus copying a secret, and the secret is
 * shown once. This was the last hand-navigated step on the path between a
 * learner talking and a learner being able to pay, and it is two documented
 * calls: create the webhook, then name it as the post-call one.
 *
 * Dry by default, like `sync:agent`, because it writes to a live workspace.
 *
 * The signing secret comes back exactly once, at creation, and this prints it.
 * It has to reach `ELEVENLABS_WEBHOOK_SECRET` in the deployment and in
 * `.env.local`; until it does, the receiving route answers 503 and every
 * delivery fails. Nothing here can put it there.
 */
import './env';

const API = 'https://api.elevenlabs.io';

interface WorkspaceWebhook {
  webhook_id?: string;
  name?: string;
  webhook_url?: string;
}

function origin(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.PUBLIC_BASE_URL?.trim() || '';
  try {
    return new URL(raw).origin;
  } catch {
    // The compiled default, same as the doctor's, so a checkout with no site
    // URL still targets the real deployment rather than refusing to run.
    return 'https://www.modojit.com';
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API + path, {
    ...init,
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY ?? '',
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} → ${res.status} ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

async function main() {
  if (!process.env.ELEVENLABS_API_KEY?.trim()) {
    console.error('ELEVENLABS_API_KEY is missing. Put it in .env.local.');
    process.exit(1);
  }

  const push = process.argv.includes('--push');
  const url = `${origin()}/api/webhooks/elevenlabs`;

  const settings = await call<{ webhooks?: { post_call_webhook_id?: string | null } }>(
    '/v1/convai/settings',
  );
  const current = settings.webhooks?.post_call_webhook_id ?? null;

  console.log(`\nTarget:     ${url}`);
  console.log(`Post-call:  ${current ?? 'none registered'}`);

  if (current) {
    console.log('\nA post-call webhook is already set. Nothing to do.');
    console.log('If deliveries are failing, the secret is the likely half:');
    console.log(`  curl -s -o /dev/null -w "%{http_code}" -X POST ${url} -d "{}"`);
    console.log('  503 = ELEVENLABS_WEBHOOK_SECRET missing there · 401 = set');
    return;
  }

  const { webhooks } = await call<{ webhooks?: WorkspaceWebhook[] }>('/v1/workspace/webhooks');
  const existing = (webhooks ?? []).find((w) => w.webhook_url === url);
  if (existing?.webhook_id) {
    console.log(`\nA webhook already points at that URL (${existing.webhook_id}),`);
    console.log('but it is not set as the post-call one.');
  }

  if (!push) {
    console.log('\nDry run. Would:');
    if (!existing) console.log(`  1. create an HMAC webhook named "ModoJIT post-call" at ${url}`);
    console.log(`  ${existing ? '1' : '2'}. set it as the post-call webhook, events: transcript`);
    console.log('\nRun again with --push to apply.');
    return;
  }

  let id = existing?.webhook_id ?? null;
  let secret: string | null = null;

  if (!id) {
    const created = await call<{ webhook_id: string; webhook_secret?: string | null }>(
      '/v1/workspace/webhooks',
      {
        method: 'POST',
        body: JSON.stringify({
          settings: { auth_type: 'hmac', name: 'ModoJIT post-call', webhook_url: url },
        }),
      },
    );
    id = created.webhook_id;
    secret = created.webhook_secret ?? null;
    console.log(`\n✓ Created webhook ${id}`);
  }

  await call('/v1/convai/settings', {
    method: 'PATCH',
    body: JSON.stringify({ webhooks: { post_call_webhook_id: id, events: ['transcript'] } }),
  });
  console.log(`✓ Set as the post-call webhook, events: transcript`);

  if (secret) {
    console.log('\nThe signing secret, which is shown once and only here:\n');
    console.log(`  ELEVENLABS_WEBHOOK_SECRET=${secret}\n`);
    console.log('Put it in .env.local and in the Vercel project settings.');
    console.log('Until it is in the deployment, every delivery fails with 503 and');
    console.log('classes are still recorded nowhere.');
  } else {
    console.log('\nNo secret returned, which happens when the webhook already existed.');
    console.log('Find it in the ElevenLabs dashboard under Developers -> Webhooks.');
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
