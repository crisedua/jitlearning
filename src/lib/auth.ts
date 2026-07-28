/**
 * Shared-secret gate for every route that can spend ElevenLabs quota or mutate
 * the knowledge base.
 *
 * Fails closed: if `INGEST_SECRET` is unset the route is denied in *every*
 * environment. Security that behaves differently in dev than in production is
 * how things ship open by accident.
 */

const HEADER = 'x-ingest-secret';

export class UnauthorizedError extends Error {
  readonly status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = 'UnauthorizedError';
    this.status = status;
  }
}

/** Constant-time compare, so the endpoint can't be used as an oracle. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Throws `UnauthorizedError` unless the request carries the shared secret,
 * either as `x-ingest-secret` or `Authorization: Bearer <secret>`.
 */
export function requireSecret(req: Request): void {
  const expected = process.env.INGEST_SECRET;
  if (!expected) {
    throw new UnauthorizedError(
      'INGEST_SECRET is not configured on the server. Set it in your Vercel project settings (and .env.local for local development).',
      503,
    );
  }

  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const provided = req.headers.get(HEADER) ?? bearer ?? '';

  if (!timingSafeEqual(provided, expected)) {
    throw new UnauthorizedError('Missing or invalid ingest secret.');
  }
}
