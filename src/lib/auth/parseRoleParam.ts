/**
 * Phase 1 subdomain (2026-05-16) — Pure helper to parse a `role` value
 * from a Next.js searchParams record. Returns one of "job_seeker" /
 * "employer" / undefined. Anything else is rejected.
 *
 * Used by the signup page to drive the role-card pre-selection: a URL
 * like /auth/signup?role=employer arrives from the hired.icareeros.com
 * signup link or from the recruiter CTA on the landing page.
 */
import type { UserRole } from "@/components/auth/AuthForm";

export function parseRoleParam(
  value: string | string[] | undefined,
): UserRole | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "employer" || raw === "job_seeker") return raw;
  return undefined;
}
