/**
 * Supabase client — browser-side singleton.
 *
 * SETUP:
 *   1. Create a project at https://supabase.com
 *   2. Copy Project URL + anon key → add to .env.local
 *   3. Run the SQL in supabase/schema.sql inside the Supabase SQL editor
 */

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

// Singleton for client components
let _client: ReturnType<typeof createClient> | null = null;

export function getSupabaseClient() {
  if (!_client) _client = createClient();
  return _client;
}
