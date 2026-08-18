/**
 * The order in which a deployment becomes usable.
 *
 * Two surfaces answer "what should I do first": `npm run doctor`, in English, on
 * whatever machine somebody runs it from, and `/admin/estado`, in Spanish,
 * inside the deployment itself. They had a copy of this ladder each, written
 * days apart, and a ladder in two places is a ladder that will disagree with
 * itself the first time a step moves.
 *
 * What is shared is the sequence and the variables each rung needs. The wording
 * is not: one audience is reading a terminal in English and the other is an
 * operator reading their own product in Spanish, and flattening that into one
 * string would serve neither.
 *
 * The order is not preference. Each rung is what makes the next one observable:
 * without sign-in nobody reaches a page that needs an account, so a fixed agent
 * changes nothing anybody can see; without the service key nothing a class
 * produces is written, so memory cannot be judged; without the webhook there is
 * nothing to measure, so the offer cannot appear. Fix them out of order and you
 * cannot tell whether the fix worked.
 */
export interface SetupRung {
  /** Stable name, so each surface can attach its own wording. */
  id: 'signin' | 'teacher' | 'recording' | 'memory' | 'search' | 'money';
  /** Every variable this rung needs. Missing any one of them selects the rung. */
  vars: readonly string[];
}

export const SETUP_ORDER: readonly SetupRung[] = [
  { id: 'signin', vars: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'] },
  { id: 'teacher', vars: ['ELEVENLABS_API_KEY', 'ELEVENLABS_AGENT_ID'] },
  { id: 'recording', vars: ['SUPABASE_SERVICE_ROLE_KEY'] },
  { id: 'memory', vars: ['ELEVENLABS_WEBHOOK_SECRET'] },
  { id: 'search', vars: ['INGEST_SECRET'] },
  { id: 'money', vars: ['STRIPE_SECRET_KEY'] },
];

/**
 * The first rung with something missing, or null when nothing is.
 *
 * `has` is passed in rather than read here, because the two callers answer it
 * differently: the deployment page has already resolved which variables are set,
 * and the doctor additionally asks whether the project URL parses, since a URL
 * without its scheme is present and is also the reason nobody can sign in.
 */
export function firstMissingRung(has: (name: string) => boolean): SetupRung | null {
  return SETUP_ORDER.find((rung) => rung.vars.some((name) => !has(name))) ?? null;
}
