import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase/server';
import { signInPath } from '@/lib/paths';

/**
 * The sign-in gate, moved above the loading boundary.
 *
 * `loading.tsx` turns this segment into a Suspense boundary, so Next flushes the
 * skeleton before the page component runs. The page's own `redirect()` is
 * therefore delivered inside the stream rather than as a status code, and
 * `/coach` answered a signed-out stranger with 200 and a loading skeleton: a
 * flash then a client-side bounce with JavaScript, and a page that never
 * resolves without it.
 *
 * This is the link every call to action in the product points at, so it is the
 * worst route to have that on, and the loading state that caused it was added
 * to fix a dead tap on the same button. It fixed it for the learner who is
 * signed in and broke it for the stranger who is not.
 *
 * A layout renders outside the Suspense boundary its segment declares, so the
 * redirect here happens before anything is flushed and Next answers with a real
 * 307. The page keeps its own check: this is a second gate, not a replacement,
 * and a page that assumes a layout ran is a page that breaks quietly when the
 * layout moves.
 *
 * Nothing about authentication changes. Same `currentUser`, same `signInPath`,
 * same destination. Only the moment it is asked.
 */
export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect(signInPath('/coach'));

  return <>{children}</>;
}
