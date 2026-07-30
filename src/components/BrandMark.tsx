/**
 * The ModoJIT logo: two offset cards crossed by a gold rule.
 *
 * Drawn rather than imported so it inherits the palette, stays crisp at any
 * size, and costs no request. Purely decorative — `Wordmark` carries the name.
 *
 * The two cards are the idea: the same thing before and after it comes into
 * focus, with the gold rule marking the moment. The front card is the one in
 * focus, so it takes the full-strength green; the back one sits at decorative
 * contrast on purpose.
 */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      // Slightly wider than tall, so width is derived rather than assumed square.
      viewBox="0 0 36 34"
      width={Math.round((size * 36) / 34)}
      height={size}
      aria-hidden
      focusable="false"
      fill="none"
      className="shrink-0"
    >
      {/* Back card — offset up and mostly vertically, as in the artwork. */}
      <rect
        x="10"
        y="3"
        width="24"
        height="19"
        rx="2.8"
        className="stroke-brand-soft"
        strokeWidth="2"
        transform="rotate(-7 22 12.5)"
      />
      {/* The gold rule crosses the back card and passes under the front outline. */}
      <path
        d="M2 21.5H32"
        className="stroke-gold"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
      {/* Front card, in focus. ~70% overlap keeps the pair reading as one stack. */}
      <rect
        x="2"
        y="11"
        width="24"
        height="19"
        rx="2.8"
        className="stroke-brand"
        strokeWidth="2"
      />
    </svg>
  );
}

/**
 * The wordmark, as real text.
 *
 * Kept as text rather than traced to paths so it scales with the reader's font
 * size, stays selectable, and reads to a screen reader as the single word
 * "ModoJIT" instead of "Modo" followed by "JIT".
 *
 * The serif/monospace split is the mark itself, not decoration. Sizes are in
 * `em` so the lockup inherits whatever the call site sets — the header and the
 * footer use different sizes and neither needs to know these ratios.
 */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-baseline leading-none ${className}`}
      aria-label="ModoJIT"
    >
      {/* Instrument Serif has a small x-height, so it is set larger to match. */}
      <span aria-hidden className="font-serif text-[1.32em] font-normal tracking-[-0.01em]">
        Modo
      </span>
      <span
        aria-hidden
        className="ml-px font-mono text-[1.06em] font-medium tracking-[0.04em] text-brand"
      >
        JIT
      </span>
    </span>
  );
}
