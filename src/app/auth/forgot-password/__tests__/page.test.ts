/**
 * /auth/forgot-password — page + client form
 *
 * File-content checks, matching the repo's existing node-env vitest
 * convention (no jsdom / @testing-library). See
 * src/app/(hire)/hire/settings/__tests__/settings-pages.test.ts for
 * precedent.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf8");

describe("/auth/forgot-password — page", () => {
  const src = read("src/app/auth/forgot-password/page.tsx");

  it("exports a default function", () => {
    expect(src).toMatch(/export\s+default\s+function\s+ForgotPasswordPage\b/);
  });

  it("has the same card + layout treatment as /auth/login (sibling styling)", () => {
    expect(src).toMatch(/rounded-2xl border border-gray-200 bg-white p-8 shadow-sm/);
    expect(src).toMatch(/flex min-h-screen items-center justify-center bg-transparent px-4/);
  });

  it("delegates the form to a client component", () => {
    expect(src).toMatch(/import\s*\{\s*ForgotPasswordForm\s*\}/);
    expect(src).toMatch(/<ForgotPasswordForm\s*\/>/);
  });
});

describe("/auth/forgot-password — form", () => {
  const src = read("src/app/auth/forgot-password/ForgotPasswordForm.tsx");

  it("is a client component", () => {
    expect(src).toMatch(/^"use client";/m);
  });

  it("calls supabase.auth.resetPasswordForEmail with redirectTo /auth/callback?type=recovery", () => {
    expect(src).toMatch(/resetPasswordForEmail\(/);
    expect(src).toMatch(/\/auth\/callback\?type=recovery/);
    // redirectTo derives from window.location.origin so all 3 subdomains work
    expect(src).toMatch(/window\.location\.origin/);
  });

  it("is enumeration-safe — always shows the same success message on submit", () => {
    // Even if resetPasswordForEmail errors, the branch still setSent(true).
    expect(src).toMatch(/setSent\(true\)/);
    // The success copy matches the brief verbatim.
    expect(src).toMatch(/If an account exists for that email/);
    expect(src).toMatch(/spam folder/i);
    // The error is logged but never rendered — no error state ever wired.
    expect(src).not.toMatch(/setError\(/);
  });

  it("shows a 'Back to login' link", () => {
    expect(src).toMatch(/href="\/auth\/login"/);
    expect(src).toMatch(/Back to login/);
  });

  it("uses brand-* Tailwind tokens (no hardcoded hex)", () => {
    expect(src).toMatch(/text-brand-600/);
    expect(src).toMatch(/bg-brand-600/);
    expect(src).not.toMatch(/#[0-9a-fA-F]{6}/);
  });
});
