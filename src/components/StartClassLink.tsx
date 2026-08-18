'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The header's call to action, absent from the classroom.
 *
 * This sat in the sticky header on every page, `/coach` included, so a learner
 * in the middle of a class read a pulsing "Empezar la clase" above the lesson.
 * It invites them to start the thing they are already doing, and tapping it
 * navigates to the page they are on: React remounts, `pagehide` fires,
 * `reportUsage` closes the session, and the class ends.
 *
 * The same fault as the floating contact button and more prominent, because this
 * one is styled to be pressed and animated to catch the eye.
 *
 * Nothing replaces it there. `/coach` carries its own start button, and during a
 * session the header should not be inviting anybody anywhere.
 */
export function StartClassLink() {
  const pathname = usePathname();
  if (pathname?.startsWith('/coach')) return null;

  return (
    <Link
      href="/coach"
      className="ml-auto inline-flex shrink-0 items-center gap-2.5 rounded-full bg-accent px-5 py-2.5 text-[15px] font-medium text-bg transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-accent-hover"
    >
      {/* One flex item, or the parent's gap opens between the two words. */}
      <span>
        Empezar<span className="hidden xs:inline"> la clase</span>
      </span>
      <span
        aria-hidden
        className="h-[7px] w-[7px] rounded-full bg-gold [animation:ring_2.2s_ease-out_infinite]"
      />
    </Link>
  );
}
