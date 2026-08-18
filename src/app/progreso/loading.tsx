/**
 * Something on screen while the notebook is read.
 *
 * This page is `force-dynamic` and makes seven reads before it can render: the
 * profile, the plan, the history, the subscription, the grant date, the balance
 * and the recommended plan. Without a loading state Next holds the previous
 * screen until all of that returns, so tapping "Tu progreso" does nothing
 * visible for as long as the slowest of them takes — and on a phone, a tap that
 * does nothing reads as a tap that missed.
 *
 * It matters here more than on the marketing pages. The notebook is the reason
 * to come back between sessions; a learner opening it is checking on hours they
 * earned, and the first impression of that check should not be a frozen screen.
 *
 * Deliberately the page's own shape rather than a spinner: the header, the
 * headline number, the plan. Somebody sees where their things are about to be
 * and reads the arriving page faster for having seen the outline.
 *
 * `aria-hidden` with a live message beside it, because a screen reader
 * announcing six grey rectangles is worse than one that says it is loading.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl space-y-12 px-6 py-10">
      <p className="sr-only" role="status">
        Cargando tu progreso
      </p>

      <div aria-hidden className="animate-pulse space-y-12">
        <header className="space-y-3">
          <div className="h-3 w-28 rounded-full bg-surface-alt" />
          <div className="h-10 w-[min(24rem,80%)] rounded-md bg-surface-alt" />
          <div className="h-4 w-[min(34rem,95%)] rounded-md bg-surface-alt" />
          <div className="mt-5 h-11 w-52 rounded-full bg-surface-alt" />
        </header>

        {/* The hours, which is what they came to see. */}
        <div className="h-28 rounded-lg border border-line bg-surface-alt/60" />

        <div className="space-y-3">
          <div className="h-6 w-40 rounded-md bg-surface-alt" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-lg border border-line bg-surface-alt/50" />
          ))}
        </div>
      </div>
    </div>
  );
}
