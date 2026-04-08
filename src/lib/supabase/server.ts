/**
 * Supabase client — server-side (for middleware + server components).
 */

import { createServerClient } from '@supabase/ssr';
import type { cookies } from 'next/headers';

export function createSupabaseServerClient(cookieStore: ReturnType<typeof cookies>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: unknown }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              (cookieStore as unknown as { set: (n: string, v: string, o: unknown) => void }).set(name, value, options)
            );
          } catch {
            // Server component — cookies can't be set; handled by middleware
          }
        },
      },
    },
  );
}
