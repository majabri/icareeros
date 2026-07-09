/**
 * /auth/reset-password — page + client form
 *
 * File-content checks, matching the repo's existing node-env vitest
 * convention. See src/app/(hire)/hire/settings/__tests__/settings-pages.test.ts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf8");

describe("/auth/reset-password — page", () => {
  const src = read("src/app/auth/reset-password/page.tsx");

  it("exports a default function", () => {
    expect(src).toMatch(/export\s+default\s+function\s+ResetPasswordPage\b/);
  });

  it("shares the login/forgot-password card treatment", () => {
    expect(src).toMatch(/rounded-2xl border border-gray-200 bg-white p-8 shadow-sm/);
    expect(src).toMatch(/flex min-h-screen items-center justify-center bg-transparent px-4/);
  });

  it("delegates the form to a client component", () => {
    expect(src).toMatch(/import\s*\{\s*ResetPasswordForm\s*\}/);
    expect(src).toMatch(/<ResetPasswordForm\s*\/>/);
  });
});

describe("/auth/reset-password — form", () => {
  const src = read("src/app/auth/reset-password/ResetPasswordForm.tsx");

  it("is a client component", () => {
    expect(src).toMatch(/^"use client";/m);
  });

  it("guards on mount — reads session before showing the password form", () => {
    expect(src).toMatch(/useEffect\(/);
    expect(src).toMatch(/supabase\.auth\.getSession\(/);
  });

  it("renders the 'expired or invalid' view when no session is present", () => {
    expect(src).toMatch(/This reset link has expired or is invalid/);
    expect(src).toMatch(/href="\/auth\/forgot-password"/);
    expect(src).toMatch(/Request a new reset link/);
  });

  it("enforces the same client-side password rules as signup + settings/security", () => {
    // >= 8 chars, and confirm-match. Matches AuthForm.tsx minLength={8}
    // and settings/security's newPassword.length < 8 check.
    expect(src).toMatch(/minLength=\{8\}/);
    expect(src).toMatch(/password\.length\s*<\s*8/);
    expect(src).toMatch(/password\s*!==\s*confirmPassword/);
  });

  it("calls supabase.auth.updateUser({ password }) on successful validation", () => {
    expect(src).toMatch(/supabase\.auth\.updateUser\(\s*\{\s*password/);
  });

  it("redirects to /auth/login after success", () => {
    expect(src).toMatch(/\/auth\/login/);
    expect(src).toMatch(/reset=1/);
  });

  it("uses brand-* Tailwind tokens (no hardcoded hex)", () => {
    expect(src).toMatch(/text-brand-600/);
    expect(src).toMatch(/bg-brand-600/);
    expect(src).not.toMatch(/#[0-9a-fA-F]{6}/);
  });
});

describe("/auth/callback — recovery branch (additive)", () => {
  const src = read("src/app/auth/callback/route.ts");

  it("detects ?type=recovery", () => {
    expect(src).toMatch(/searchParams\.get\("type"\)\s*===\s*"recovery"/);
  });

  it("redirects to /auth/reset-password when recovery, WITHOUT signing out", () => {
    // The recovery branch must come BEFORE the signup-confirmation
    // signOut() so the recovery session is preserved.
    const recoveryIdx = src.indexOf("/auth/reset-password");
    const signoutIdx  = src.indexOf("signOut()");
    expect(recoveryIdx).toBeGreaterThan(-1);
    expect(signoutIdx).toBeGreaterThan(-1);
    expect(recoveryIdx).toBeLessThan(signoutIdx);
  });

  it("does not touch the existing OAuth (explicitNext) or signup-confirm paths", () => {
    // Both existing paths remain — regression guard.
    expect(src).toMatch(/explicitNext/);
    expect(src).toMatch(/\/auth\/login\?confirmed=true/);
  });
});

describe("AuthForm — Forgot password link on /auth/login", () => {
  const src = read("src/components/auth/AuthForm.tsx");

  it("renders the link only in login mode", () => {
    expect(src).toMatch(/mode\s*===\s*"login"\s*&&\s*\(/);
    expect(src).toMatch(/Forgot password\?/);
  });

  it("links to /auth/forgot-password", () => {
    expect(src).toMatch(/href="\/auth\/forgot-password"/);
  });

  it("uses the same brand-* link styling as 'Sign up free'", () => {
    expect(src).toMatch(/text-brand-600 hover:text-brand-700/);
  });
});
