import type { Metadata } from "next";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata: Metadata = { title: "Reset password — iCareerOS" };

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-transparent px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Reset your password</h1>
          <p className="mt-2 text-sm text-gray-500">
            Enter your email and we&apos;ll send you a link to set a new one.
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <ForgotPasswordForm />
        </div>
      </div>
    </div>
  );
}
