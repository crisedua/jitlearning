import type { MetadataRoute } from 'next';
import { configuredOrigin, DEFAULT_ORIGIN } from '@/lib/canonical';

/**
 * What a crawler may read, and where the list of pages is.
 *
 * There was no robots.txt, which is not neutral: a crawler with no instructions
 * reads everything it can reach, including `/coach` and `/progreso`, which
 * redirect to a sign-in it cannot complete, and `/knowledge`, which is
 * administrative. `noindex` on a page keeps it out of results and only after the
 * page has been fetched; this keeps the fetch from happening.
 *
 * The disallows are the same set of surfaces the noindex rule covers, said in
 * the other place a crawler looks. Two mechanisms for one intention, because the
 * meta tag is authoritative and the file is what gets consulted first.
 *
 * Built from the same origin as the canonical links and the search tool
 * endpoint, so a fork or a domain change moves all of them together.
 */
export default function robots(): MetadataRoute.Robots {
  const origin = configuredOrigin() ?? DEFAULT_ORIGIN;

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/admin/',
        '/knowledge',
        // Both redirect to a sign-in a crawler cannot complete, so every fetch
        // is a 307 into a wall. Nothing to index and nothing to gain.
        '/coach',
        '/progreso',
        // The sign-in failure page. It exists to be landed on with an error
        // code in the URL, never to be found.
        '/acceso',
        '/api/',
      ],
    },
    sitemap: `${origin}/sitemap.xml`,
  };
}
