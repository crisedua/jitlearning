import type { MetadataRoute } from 'next';
import { configuredOrigin, DEFAULT_ORIGIN } from '@/lib/canonical';

/**
 * The pages a stranger can actually read.
 *
 * Listed rather than derived from the filesystem, because the question is not
 * which pages exist but which ones answer a stranger: everything else redirects
 * to a sign-in, is administrative, or exists to be landed on with an error code.
 *
 * `priority` is ordered by what somebody deciding needs: the argument, then the
 * way in, then the price, then what happens to their data, then the offer that
 * gets the first ten people in. `/registro` sits second because it is the only
 * page here that a stranger can *finish* — the others are all read and left.
 * `changeFrequency` is honest rather than optimistic — the prices and the
 * promises move when the product moves, which is not weekly.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = configuredOrigin() ?? DEFAULT_ORIGIN;

  return [
    { url: `${origin}/`, changeFrequency: 'monthly', priority: 1 },
    { url: `${origin}/registro`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${origin}/planes`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${origin}/privacidad`, changeFrequency: 'yearly', priority: 0.5 },
    { url: `${origin}/feedback`, changeFrequency: 'monthly', priority: 0.5 },
  ];
}
