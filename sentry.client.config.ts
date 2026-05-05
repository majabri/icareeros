/**
 * Sentry browser-side initialisation.
 * This file is loaded automatically by @sentry/nextjs on the client.
 *
 * Per privacy policy + cookie consent banner: Sentry is gated on
 * the user opting into the "analytics" cookie category. If the user has
 * not given consent, Sentry is not initialized at all on this page load.
 * Granting consent triggers a page reload so this file re-evaluates with
 * the new state.
 */
import * as Sentry from "@sentry/nextjs";

function hasAnalyticsConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem("icareeros.consent.v1");
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return parsed?.analytics === true;
  } catch {
    return false;
  }
}

if (hasAnalyticsConsent()) {
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
}
