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
