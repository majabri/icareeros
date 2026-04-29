"use client";

/**
 * global-error.tsx
 *
 * Next.js 15 App Router global error boundary.
 * Catches unhandled errors that propagate past all route-level error.tsx files.
 * Reports to Sentry and renders a minimal recovery UI.
 *
 * Note: This component renders instead of the root layout on error,
 * so it must include <html> and <body>.
 */

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Report to Sentry — includes stack trace, digest, and session context.
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-900 antialiased">
        <div className="mx-auto max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm text-center">
          <div className="mb-4 text-4xl">⚠️</div>
          <h1 className="mb-2 text-xl font-semibold text-gray-900">
            Something went wrong
          </h1>
          <p className="mb-6 text-sm text-gray-500">
            An unexpected error occurred. Our team has been notified automatically.
            {error.digest && (
              <span className="mt-1 block font-mono text-xs text-gray-400">
                ID: {error.digest}
              </span>
            )}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              onClick={reset}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              Try again
            </button>
            <a
              href="/"
              className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
