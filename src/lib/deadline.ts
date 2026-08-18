/**
 * A ceiling on how long something is allowed to take.
 *
 * Every network call in this app is to somebody else's service, and `fetch` has
 * no timeout. That is fine where a caller can wait and wrong in the two places
 * it is used from:
 *
 * The memory lookup runs inside `/api/signed-url`, before the microphone opens.
 * A slow ElevenLabs meant a learner pressing "empezar la clase" and getting
 * nothing until Vercel killed the function, which is worse than an error because
 * an error at least produces a sentence.
 *
 * The agent check runs inside `/admin/estado`, which exists to say what is wrong
 * with a deployment. A diagnostic that hangs is useless at exactly the moment it
 * is opened, and the thing making it hang is quite likely the thing being
 * diagnosed.
 *
 * The losing promise is not cancelled. It is one request whose result is
 * discarded, and threading an AbortSignal through every layer would save nothing
 * measurable.
 */
export function withDeadline<T>(work: Promise<T>, fallback: T, ms: number): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}
