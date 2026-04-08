/**
 * Login page — Server Component wrapper.
 * `export const dynamic = 'force-dynamic'` only works in Server Components.
 * The actual form is loaded with { ssr: false } so the Supabase browser
 * client is never instantiated during build or SSR.
 */
import nextDynamic from 'next/dynamic';

export const dynamic = 'force-dynamic';

const LoginForm = nextDynamic(
  () => import('./LoginForm').then(m => ({ default: m.LoginForm })),
  { ssr: false },
);

export default function LoginPage() {
  return <LoginForm />;
}
