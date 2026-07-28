/**
 * Load environment for the CLI scripts.
 *
 * Next.js loads `.env.local` automatically, but a bare `tsx` process does not —
 * `dotenv/config` only reads `.env`. Import this first in any script so both
 * files work, with `.env.local` taking precedence.
 */
import { config } from 'dotenv';

config({ path: '.env.local' });
config({ path: '.env' });
