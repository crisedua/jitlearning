/**
 * A short-lived, signed claim that "this is modojit learner X".
 *
 * ## Why this exists
 *
 * The lab at iajit.vercel.app is a second Vercel project on a *second Supabase
 * project* — `lkserdjwmbbqngegldrw`, where modojit is `kmreloatvnnlieydlfuq`.
 * The same human signs into both and gets two different `auth.uid()`s. So the
 * obvious design, where the lab writes practice rows straight into modojit's
 * table, cannot work: different database, different id, no join.
 *
 * This is the cheap way across. modojit mints a token carrying its own user id,
 * puts it in the link that opens the lab, and the lab hands it back when it
 * reports what the learner practised. Nothing is shared but a secret both
 * deployments already hold, and neither app needs an account on the other's
 * database.
 *
 * ## What a stolen token can do
 *
 * Write practice rows for one learner, for a few hours. That is the whole blast
 * radius, and it is why the endpoint that accepts these does nothing else: it
 * cannot grant a plan, spend minutes on a class, read a transcript, or change a
 * profile. The cost of the worst case is a wrong line in one person's record,
 * which the teacher would read as a strange homework note.
 *
 * It is deliberately not a session. It authenticates a *claim about identity*
 * made by another service we run, not a person, and the learner still signs in
 * to the lab with their own account.
 *
 * HMAC over `uid.exp` with `INGEST_SECRET`, base64url, no dependency. A JWT
 * would be the same three fields with a library and a spec attached.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * How long a token is good for.
 *
 * Long enough to cover practising in the evening after an afternoon class, and
 * short enough that one leaked link stops mattering the same day. The link is
 * opened from the learner's own progress page, so a fresh one is always one
 * page load away — there is no reason to make these durable.
 */
export const LAB_TOKEN_TTL_SECONDS = 8 * 60 * 60;

function secret(): string {
  const value = process.env.INGEST_SECRET?.trim();
  if (!value) throw new Error('INGEST_SECRET is not set, so no lab token can be signed.');
  return value;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

/**
 * Mint a token for this learner. `now` is injectable so the tests do not have
 * to sleep to observe expiry.
 */
export function mintLabToken(userId: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + LAB_TOKEN_TTL_SECONDS;
  const payload = `${userId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * The user id this token vouches for, or null.
 *
 * Null for every failure — malformed, expired, wrong signature, unsigned — and
 * deliberately without saying which. The caller is a public endpoint and the
 * difference between "expired" and "forged" is information only an attacker
 * wants.
 */
export function readLabToken(token: string | null | undefined, now = Date.now()): string | null {
  if (!token) return null;

  /*
   * Split from the right. A Supabase user id is a uuid and contains no dots
   * today, but a payload that ever gains one would otherwise silently start
   * verifying the wrong bytes — the kind of change that looks harmless in a
   * diff and turns a signature check into decoration.
   */
  const lastDot = token.lastIndexOf('.');
  if (lastDot <= 0) return null;

  const payload = token.slice(0, lastDot);
  const provided = token.slice(lastDot + 1);
  const expected = sign(payload);

  /*
   * Constant time, and length-checked first because `timingSafeEqual` throws on
   * a length mismatch rather than returning false.
   */
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const cut = payload.lastIndexOf('.');
  if (cut <= 0) return null;
  const userId = payload.slice(0, cut);
  const exp = Number(payload.slice(cut + 1));

  if (!Number.isFinite(exp) || exp * 1000 < now) return null;
  if (!userId) return null;
  return userId;
}
