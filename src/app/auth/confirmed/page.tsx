import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Email confirmed — iCareerOS",
  description: "Your iCareerOS account is verified. Sign in to start your career operating system.",
};

export default function EmailConfirmedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-transparent px-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm text-center">
          {/* Success ring */}
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <svg
              className="h-8 w-8 text-emerald-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-gray-900">
            Your email is confirmed
          </h1>
          <p className="mt-3 text-sm text-gray-600">
            Welcome to iCareerOS. Your account is verified and ready — sign in to
            start your first cycle: <span className="font-medium text-gray-800">Evaluate → Advise → Learn → Act → Coach → Achieve</span>.
          </p>

          <Link
            href="/auth/login"
            className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
          >
            Sign in to continue
          </Link>

        </div>
      </div>
    </div>
  );
}
