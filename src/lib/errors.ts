/**
 * The failures that are the browser's, not ours, said in the language of the
 * page.
 *
 * Every one of these components throws its own message for anything the server
 * reports: `/api/checkout` answers "Los pagos todavía no están habilitados", the
 * feedback route answers in Spanish, and those arrive already written for the
 * person reading them. What does not is the request never leaving: a dropped
 * connection, a tunnel, aeroplane mode, a captive portal. `fetch` rejects with a
 * TypeError whose message the browser writes, and Chrome says "Failed to fetch"
 * while Safari says "Load failed".
 *
 * That string was going into the error box under the buy button. Somebody who
 * has read their own measured hours, decided to pay, and pressed the button on a
 * phone with two bars gets three English words that do not say to try again.
 *
 * The rule is the same one `mic.ts` follows and worth stating once: translate
 * only what is recognised. An unknown fault keeps its own words, because a
 * confident wrong sentence sends somebody to fix something that was never
 * broken.
 */

/** Chrome, Safari, Firefox and Edge, respectively, for a request that never left. */
const OFFLINE = /failed to fetch|load failed|networkerror|network error|error de red/i;

export function connectionMessage(err: unknown): string | null {
  if (!(err instanceof Error)) return null;

  // A request the page itself gave up on, rather than one that failed.
  if (err.name === 'AbortError' || err.name === 'TimeoutError') {
    return 'La conexión tardó demasiado. Vuelve a intentarlo.';
  }

  /*
   * `TypeError` is what fetch rejects with when the request never reached a
   * server. Checked together with the message because a TypeError can also come
   * from a genuine bug in our own code, and telling somebody to check their
   * connection would send them looking in the wrong place.
   */
  if (err.name === 'TypeError' && OFFLINE.test(err.message)) {
    return 'No pudimos conectar. Revisa tu conexión y vuelve a intentarlo.';
  }

  return null;
}

/**
 * Something broke while the class was running.
 *
 * The voice SDK reports faults as a plain string, in English, written for
 * whoever integrated it: a socket that closed, an audio worklet that failed, a
 * server that hung up. That string went straight into the error box, mid-class,
 * to somebody who was in the middle of a sentence.
 *
 * ## Why this one translates by default and `micMessage` does not
 *
 * The rule elsewhere in this file is to leave an unrecognised fault in its own
 * words, because a confident wrong sentence sends people to fix the wrong thing.
 * That rule earns its keep when the original could still help: a denied
 * microphone names a permission somebody can go and grant.
 *
 * Nothing here is like that. A learner cannot act on a WebSocket close code, and
 * the only move available to them is the same one in every case, which is to
 * press the button again. So the default is the sentence that says exactly that,
 * and the original goes to the console where somebody who can act on it will
 * look. Losing it entirely would be the mistake; showing it to a person
 * mid-class is a different one.
 */
export function liveCallMessage(raw: string): string {
  const said = raw.trim();
  if (!said) return 'La clase se cortó. Aprieta el botón otra vez para retomarla.';

  /*
   * No pass-through for "already Spanish", deliberately.
   *
   * The first version of this looked for accented characters and returned the
   * string untouched, so that a message of ours would reach the reader as
   * written. Its own test disproved it: "Se te acabaron los minutos del plan
   * gratis" carries no accent at all, and plenty of Spanish does not.
   *
   * The heuristic was also answering a question that does not arise. The plan
   * gate refuses before the socket opens, at `/api/signed-url`, and that message
   * reaches the error box through `start`. Nothing of ours is sent into a live
   * conversation, so everything arriving here was written by the platform, in
   * English, for a developer. Guessing the language of a string is a worse
   * mechanism than knowing where it came from.
   */
  if (/microphone|audio|worklet|media/i.test(said)) {
    return 'Se perdió el micrófono durante la clase. Revisa que ninguna otra aplicación lo esté usando y aprieta el botón otra vez.';
  }
  if (/websocket|connection|network|timeout|closed|disconnect/i.test(said)) {
    return 'Se cortó la conexión con el profesor. Aprieta el botón otra vez y sigues donde ibas.';
  }

  return 'La clase se cortó. Aprieta el botón otra vez para retomarla.';
}
