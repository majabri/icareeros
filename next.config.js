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
