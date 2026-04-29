/**
 * Sentry server-side initialisation.
 * This file is loaded automatically by @sentry/nextjs on the Node.js server.
 * Runs in API routes, Server Components, and server actions.
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Capture 10% of server transactions in production.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Include request data (headers, body snippet) with errors.
  // PII is masked by default in @sentry/nextjs — safe for GDPR.
  sendDefaultPii: false,

  debug: false,

  environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV,

  // Ignore expected operational errors that don't need alerting.
  ignoreErrors: [
    "NEXT_NOT_FOUND",         // Next.js notFound() throws this
    "NEXT_REDIRECT",          // redirect() throws this
  ],
});
