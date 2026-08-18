/**
 * Something on screen while the classroom is prepared.
 *
 * This is the click every call to action points at: "empezar la primera clase"
 * on the landing page, "seguir con la clase" on the notebook. It reads the
 * learner, the balance and any open commitment before it can render, and it
 * carries the voice SDK, which is the largest bundle in the app.
 *
 * Without a loading state Next holds the previous screen for all of that, so the
 * one button this product most wants pressed appears to do nothing — and the
 * person pressing it has just decided to try the thing. That is the worst
 * possible moment for a dead tap.
 *
 * The shape is the page's: the heading, the pending commitment where it sits
 * above the session, and the panel with the objective field and the start
 * button. Nothing here claims a commitment exists; it is a grey block that
 * either becomes one or collapses, which is honest in a way a spinner and a
 * fake row are not.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-[96rem] space-y-8 px-6 py-10">
      <p className="sr-only" role="status">
        Preparando tu clase
      </p>

      <div aria-hidden className="animate-pulse space-y-8">
        <header className="space-y-3">
          <div className="h-3 w-32 rounded-full bg-surface-alt" />
          <div className="h-10 w-[min(22rem,80%)] rounded-md bg-surface-alt" />
          <div className="h-4 w-[min(32rem,95%)] rounded-md bg-surface-alt" />
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_24rem] xl:gap-8">
          <div className="space-y-6">
            <div className="h-24 rounded-lg border border-line bg-surface-alt/50" />
            <div className="rounded-lg border border-line bg-surface p-5 sm:p-6">
              <div className="h-3 w-28 rounded-full bg-surface-alt" />
              <div className="mt-3 h-11 w-full max-w-xl rounded-md bg-surface-alt" />
              <div className="mt-5 h-11 w-56 rounded-full bg-surface-alt" />
            </div>
          </div>
          <div className="h-72 rounded-lg border border-line bg-surface-alt/40" />
        </div>
      </div>
    </div>
  );
}
