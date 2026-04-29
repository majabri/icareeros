/**
 * Sentry browser-side initialisation.
 * This file is loaded automatically by @sentry/nextjs on the client.
 * It runs in every browser session, so keep it lean.
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Capture 10% of sessions as performance traces in production,
  // 100% in development so you can see traces locally.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Replay 1% of all sessions, 100% on error (production only).
  replaysSessionSampleRate: 0.01,
  replaysOnErrorSampleRate: 1.0,

  // Session replay is large — only load in production.
  integrations:
    process.env.NODE_ENV === "production"
      ? [
          Sentry.replayIntegration({
            maskAllText: true,
            blockAllMedia: true,
          }),
        ]
      : [],

  // Suppress Sentry output in development unless explicitly enabled.
  debug: false,

  environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV,
});
