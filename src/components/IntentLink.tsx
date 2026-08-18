'use client';

/**
 * The buy link, which also says that it was clicked.
 *
 * Identical to the anchor it replaces from the person's side: same href, same
 * label, same navigation. The only addition is a beacon to /api/intent, sent
 * before the browser leaves, so a purchase attempt made over WhatsApp or email
 * stops being invisible to the product.
 *
 * `sendBeacon` rather than `fetch`, because this fires during a navigation away
 * from the page. A `fetch` started in a click handler is cancelled when the
 * document goes away; `sendBeacon` hands the request to the browser, which
 * delivers it afterwards. It is also fire-and-forget by construction, so there
 * is no promise anybody could accidentally await and no way for a slow database
 * to sit between somebody and the thing they just decided to buy.
 *
 * Nothing is prevented and nothing is awaited: if the beacon fails, is blocked
 * by an extension, or the API is unconfigured, the click still opens the mail
 * client. Measurement is the thing that degrades here, never the sale.
 */
export function IntentLink({
  href,
  plan,
  channel,
  className,
  target,
  rel,
  children,
}: {
  href: string;
  plan: string;
  channel: 'email' | 'whatsapp';
  className?: string;
  target?: string;
  rel?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={className}
      target={target}
      rel={rel}
      onClick={() => {
        try {
          navigator.sendBeacon?.(
            '/api/intent',
            new Blob([JSON.stringify({ plan, channel })], { type: 'application/json' }),
          );
        } catch {
          // A blocked beacon is not worth a broken link.
        }
      }}
    >
      {children}
    </a>
  );
}
