/**
 * Sentry edge-runtime initialisation.
 * This file is loaded automatically by @sentry/nextjs for middleware and
 * route handlers that opt into `export const runtime = "edge"`.
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Edge functions are short-lived; sample more aggressively.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,

  debug: false,

  environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV,
});
