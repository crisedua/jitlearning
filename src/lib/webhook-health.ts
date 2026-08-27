/**
 * Whether the post-call webhook is actually delivering, decided from what
 * ElevenLabs knows rather than from what this deployment has in its environment.
 *
 * ## Why presence was never the question
 *
 * The old check asked whether `ELEVENLABS_WEBHOOK_SECRET` was set and reported
 * green when it was. That is a real failure — a missing secret makes the route
 * answer 503 to every delivery — but it is only one of the two ways this breaks,
 * and it is the less likely one after the first day.
 *
 * The other way is a secret that is present and *wrong*, and it is invisible
 * from inside: the route computes an HMAC, compares it against the one that
 * arrived, refuses the request with a correct-looking 401, and every check that
 * reads the environment goes on saying the variable is set. This project ran in
 * exactly that state for nine days. Eleven classes happened, forty-four minutes
 * of teaching, two of them ten minutes long. None produced a summary, a plan
 * step or a measured minute, and `/api/health` reported `ready: true` for every
 * one of them.
 *
 * ElevenLabs, meanwhile, knew the whole time. It records the last failure code
 * against the webhook and switches it off after enough of them. That is the
 * signal this asks for, because it is the only one that can tell a secret that
 * matches from a secret that merely exists.
 *
 * Pure, so it can be tested without a network: the route fetches, this decides.
 */
import type { WorkspaceWebhook } from './elevenlabs';

export interface WebhookVerdict {
  state: 'ok' | 'fail' | 'skipped';
  detail: string;
}

/**
 * How recently a failure still counts against the deployment.
 *
 * Retries are off on this webhook, so one failure is one class lost for good —
 * there is no transient category worth forgiving. A day is long enough that a
 * fault which has genuinely been fixed stops being reported after the next
 * successful class, and short enough that a fault from this morning is still on
 * the page when somebody looks.
 */
export const RECENT_FAILURE_SECONDS = 24 * 60 * 60;

/** What an HTTP status coming back from our own route actually means. */
function meaning(code: number): string {
  switch (code) {
    case 401:
      return 'a 401, which means the ELEVENLABS_WEBHOOK_SECRET in this deployment is not the secret this webhook signs with. Copy the signing secret from the ElevenLabs dashboard into the Vercel project settings and redeploy';
    case 503:
      return 'a 503, which means ELEVENLABS_WEBHOOK_SECRET was missing from the deployment when the delivery arrived';
    case 404:
      return 'a 404, which means the registered URL does not point at /api/webhooks/elevenlabs on this deployment';
    default:
      return `a ${code}, which came from the route itself rather than from the signature check`;
  }
}

export function postCallWebhookVerdict(input: {
  /** Whether `ELEVENLABS_WEBHOOK_SECRET` is set here. */
  secretSet: boolean;
  /** False when ElevenLabs could not be asked at all — no API key, or the call failed. */
  asked: boolean;
  /** `webhooks.post_call_webhook_id` from the workspace settings. */
  postCallId: string | null;
  /** That webhook's own record, when it could be found in the workspace list. */
  hook: WorkspaceWebhook | null;
  nowSeconds: number;
}): WebhookVerdict {
  const { secretSet, asked, postCallId, hook, nowSeconds } = input;

  /*
   * Checked first and on its own, because it is decisive without asking
   * anybody: with no secret the route refuses every delivery before it reads a
   * byte, and no amount of correct registration on the other side changes that.
   */
  if (!secretSet) {
    return {
      state: 'fail',
      detail:
        'ELEVENLABS_WEBHOOK_SECRET is missing, so /api/webhooks/elevenlabs answers 503 to every post-call delivery and no class is ever saved.',
    };
  }

  /*
   * Skipped rather than failed. The API key is checked above this in its own
   * right, so a deployment without one is already red for the reason that
   * matters; claiming the webhook is broken as well would be inventing a second
   * fault out of one missing key.
   */
  if (!asked) {
    return {
      state: 'skipped',
      detail:
        'ELEVENLABS_WEBHOOK_SECRET is set, but ElevenLabs could not be asked whether deliveries are landing.',
    };
  }

  if (!postCallId) {
    return {
      state: 'fail',
      detail:
        'No post-call webhook is registered at ElevenLabs, so a class ends and the transcript is sent nowhere. Run `npm run setup:webhook -- --push`.',
    };
  }

  if (!hook) {
    return {
      state: 'fail',
      detail: `The workspace names ${postCallId} as its post-call webhook and no webhook with that id exists, so nothing is delivered anywhere.`,
    };
  }

  const failure = hook.most_recent_failure_error_code ?? null;

  /*
   * Disabled is the end state, not a warning. ElevenLabs switches a webhook off
   * after enough consecutive failures, and what it leaves behind is
   * indistinguishable from never having created one: nothing is sent, nothing is
   * recorded, and no failure is logged either, because there are no more
   * attempts to fail.
   */
  if (hook.is_disabled) {
    const how = hook.is_auto_disabled
      ? 'auto-disabled by ElevenLabs after repeated failures'
      : 'disabled';
    const why = failure ? `. The last delivery got ${meaning(failure)}` : '';
    return {
      state: 'fail',
      detail: `The post-call webhook is ${how}, so no class is being recorded at all${why}.`,
    };
  }

  const failedAt = hook.most_recent_failure_timestamp ?? null;
  if (failure && failedAt && nowSeconds - failedAt <= RECENT_FAILURE_SECONDS) {
    return {
      state: 'fail',
      detail: `The post-call webhook is enabled and its last delivery failed: ${meaning(failure)}. Retries are off, so that class is not coming back.`,
    };
  }

  return {
    state: 'ok',
    detail: 'The post-call webhook is registered, enabled, and its deliveries are landing.',
  };
}
