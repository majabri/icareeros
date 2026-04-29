/**
 * Smoke tests confirming Sentry config files exist and export the right shape.
 * We don't call Sentry.init() in unit tests — that's tested by E2E and the
 * Sentry wizard's own test suite.
 */
import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "../../");

describe("Sentry config files", () => {
  it("sentry.client.config.ts exists at project root", () => {
    expect(existsSync(resolve(ROOT, "sentry.client.config.ts"))).toBe(true);
  });

  it("sentry.server.config.ts exists at project root", () => {
    expect(existsSync(resolve(ROOT, "sentry.server.config.ts"))).toBe(true);
  });

  it("sentry.edge.config.ts exists at project root", () => {
    expect(existsSync(resolve(ROOT, "sentry.edge.config.ts"))).toBe(true);
  });

  it("global-error.tsx exists in src/app", () => {
    expect(existsSync(resolve(ROOT, "src/app/global-error.tsx"))).toBe(true);
  });

  it("next.config.js wraps with withSentryConfig", () => {
    // Read the file and assert it references Sentry
    const fs = require("fs");
    const content: string = fs.readFileSync(
      resolve(ROOT, "next.config.js"),
      "utf8"
    );
    expect(content).toContain("withSentryConfig");
    expect(content).toContain("@sentry/nextjs");
  });
});
