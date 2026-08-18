/**
 * A denied microphone, said in the language of the product.
 *
 * `getUserMedia` rejects with a DOMException whose `message` is written by the
 * browser, in English, for a developer: Chrome says "Permission denied", Safari
 * says "The request is not allowed by the user agent or the platform in the
 * current context". That string was going straight into the error box.
 *
 * It lands at the worst moment this product has. The person has read the page,
 * pressed the one button every call to action points at, and been asked for
 * their microphone — and whether they refused, mistapped, or have it blocked in
 * settings from some other site, what they get back is a sentence in a foreign
 * language that does not say what to do. On a phone that is most of the failures
 * a voice product ever has, because the permission lives in the operating system
 * and is denied by default until somebody grants it.
 *
 * Matched on `name`, which is standardised, rather than on the message, which is
 * not. Anything unrecognised falls through to the old behaviour, because a wrong
 * translation of an unknown fault is worse than the fault's own words.
 */
export function micMessage(err: unknown): string | null {
  const name = err instanceof Error ? err.name : '';

  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'No nos diste permiso para usar el micrófono, así que la clase no puede empezar. Búscalo en el candado de la barra de direcciones, o en los ajustes del navegador, y vuelve a apretar el botón.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No encontramos ningún micrófono en este dispositivo. Conecta unos audífonos con micrófono, o entra desde el teléfono.';
    case 'NotReadableError':
    case 'AbortError':
      return 'Otra aplicación está usando el micrófono. Cierra la llamada o la grabación que tengas abierta y vuelve a apretar el botón.';
    default:
      return null;
  }
}
