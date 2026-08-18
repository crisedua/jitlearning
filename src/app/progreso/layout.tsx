import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/supabase/server';
import { signInPath } from '@/lib/paths';

/**
 * The same gate as `coach/layout.tsx`, for the same reason.
 *
 * `loading.tsx` makes this segment a Suspense boundary, so the page's own
 * `redirect()` arrives inside the stream instead of as a status code and a
 * signed-out visitor is answered with 200 and a skeleton. "Tu progreso" sits in
 * the header on every page including the marketing ones, so the person most
 * likely to click it while signed out is a stranger who has just arrived.
 *
 * A layout renders outside its segment's Suspense boundary, so this redirect is
 * a real 307 before anything is flushed. The page keeps its own check.
 */
export default async function ProgresoLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect(signInPath('/progreso'));

  return <>{children}</>;
}
