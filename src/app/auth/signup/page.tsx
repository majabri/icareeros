import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";

export const metadata: Metadata = { title: "Create account — iCareerOS" };

export default function SignupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-transparent px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Start your career OS</h1>
          <p className="mt-2 text-sm text-gray-500">
            Free forever. No credit card required.
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <AuthForm mode="signup" />
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
