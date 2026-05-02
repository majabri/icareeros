import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";

export const metadata: Metadata = { title: "Sign in — iCareerOS" };

const ERROR_MESSAGES: Record<string, string> = {
  missing_code:
    "That confirmation link is missing its verification code. Please request a new email below or sign up again.",
  verification_failed:
    "We couldn't verify that confirmation link. It may have expired or already been used. Try signing in below — if your email is already confirmed, your password still works.",
};

interface PageProps {
  searchParams: Promise<{ error?: string; detail?: string; confirmed?: string }>;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const errorMessage = params.error ? ERROR_MESSAGES[params.error] : null;
  const justConfirmed = params.confirmed === "true";

  return (
    <div className="flex min-h-screen items-center justify-center bg-transparent px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
          <p className="mt-2 text-sm text-gray-500">
            Sign in to your iCareerOS account
          </p>
        </div>

        {justConfirmed && (
          <div
            role="status"
            className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
          >
            ✓ Your email is confirmed. Sign in to continue.
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            {errorMessage}
          </div>
        )}

        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <AuthForm mode="login" />
        </div>
      </div>
    </div>
  );
}
