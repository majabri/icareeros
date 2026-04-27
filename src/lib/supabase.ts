/**
 * iCareerOS — Supabase Client
 * Single shared instance for the Next.js 14 app.
 * Adapted from azjobs/src/integrations/supabase/client.ts.
 *
 * Server components: use createServerClient() from @supabase/ssr
 * Client components: use createClient() from this file
 */

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

// Convenience singleton for client-component use
// (React-safe: createBrowserClient is idempotent)
export const supabase = createClient();
