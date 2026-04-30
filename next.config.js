// @ts-check
const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Strict mode enabled for React best practices
  reactStrictMode: true,

  // Environment variable validation at build time
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },


  // HTTP security headers — Lighthouse, OWASP, and browser security best practices
  async headers() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://*.supabase.co";
    const supabaseHost = supabaseUrl.replace(/^https?:\/\//, "");

    return [
      {
        source: "/(.*)",
        headers: [
          // Prevent clickjacking
          { key: "X-Frame-Options", value: "DENY" },
          // Prevent MIME-type sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Referrer policy — don't leak path to third parties
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // HSTS — 1 year, include subdomains
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          // Disable browser features we don't use
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          // Content Security Policy
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              `connect-src 'self' https://${supabaseHost} wss://${supabaseHost} https://api.anthropic.com https://o*.ingest.sentry.io`,
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.supabase.co",
              "font-src 'self'",
              "frame-src https://js.stripe.com https://hooks.stripe.com",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "upgrade-insecure-requests",
            ].join("; "),
          },
          // XSS protection (legacy browsers)
          { key: "X-XSS-Protection", value: "1; mode=block" },
        ],
      },
    ];
  },

  // Image domains (add Supabase storage bucket when configured)
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        port: "",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

module.exports = withSentryConfig(nextConfig, {
  // Sentry build-time options
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Only upload source maps in CI / production builds to keep local dev fast.
  silent: !process.env.CI,

  // Upload source maps to Sentry so stack traces show original TypeScript.
  // Requires SENTRY_AUTH_TOKEN env var in Vercel.
  widenClientFileUpload: true,

  // Automatically tree-shake Sentry logger statements in production.
  disableLogger: true,

  // Hides Sentry release name from bundle (security best practice).
  hideSourceMaps: true,

  // Route through /monitoring so Sentry tunnelling avoids ad-blockers.
  tunnelRoute: "/monitoring",

  // Automatically instrument Next.js features (Server Components, API routes).
  autoInstrumentServerFunctions: true,
  autoInstrumentMiddleware: true,
  autoInstrumentAppDirectory: true,
});
