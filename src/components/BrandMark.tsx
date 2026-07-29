/**
 * The logo mark: a navy tile with a speech-drop and a gold dot.
 *
 * Drawn rather than imported so it inherits the palette and stays crisp at any
 * size. Purely decorative — the wordmark beside it carries the name.
 */
export function BrandMark({ size = 32 }: { size?: number }) {
  const dot = Math.max(5, Math.round(size * 0.19));
  const drop = Math.round(size * 0.41);

  return (
    <span
      aria-hidden
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}
      className="relative grid shrink-0 place-items-center overflow-hidden bg-gradient-to-br from-accent-lift to-accent-deep shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
    >
      <span
        style={{ width: drop, height: drop }}
        className="-rotate-12 rounded-[50%_50%_50%_3px] bg-bg"
      />
      <span
        style={{ width: dot, height: dot }}
        className="absolute bottom-[15%] right-[15%] rounded-full bg-gold"
      />
    </span>
  );
}
