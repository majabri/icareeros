import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";
import { parseRoleParam } from "@/lib/auth/parseRoleParam";

export const metadata: Metadata = { title: "Create account — iCareerOS" };

/**
 * Phase 1 subdomain (2026-05-16) — signup page is now a dual-path entry
 * for job seekers and recruiters. The heading copy is generic; the
 * AuthForm shows a two-card role selector before any credential fields,
 * and `?role=` in the URL pre-selects a card.
 */
export default async function SignupPage({
  searchParams,
}: {
  // Next 15 App Router — searchParams is a Promise of a record.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const initialRole = parseRoleParam(sp.role);

  return (
    <div className="flex min-h-screen items-center justify-center bg-transparent px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Join iCareerOS</h1>
          <p className="mt-2 text-sm text-gray-500">
            Choose your path to get started.
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <AuthForm mode="signup" initialRole={initialRole} />
        </div>
        <p className="mt-6 text-center text-xs text-gray-400">
          By creating an account you agree to our{" "}
          <a href="/legal/terms" className="underline hover:text-gray-600">Terms of Service</a>{" "}
          and{" "}
          <a href="/legal/privacy" className="underline hover:text-gray-600">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}
