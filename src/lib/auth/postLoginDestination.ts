/**
 * Phase 1 subdomain (2026-05-16) — Pure decision table for "after a
 * successful sign-in, where do we send the user?"
 *
 * Both the middleware and AuthForm.tsx call this so the logic stays in
 * one place and is unit-testable.
 *
 * Decision precedence (first match wins):
 *   admin                              → /admin
 *   explicit ?redirect= non-admin path → that path
 *   employer ∧ job_seeker (dual)       → /auth/choose-platform
 *   employer                           → hiredUrl/dashboard (prod) or /hired/dashboard (dev)
 *   job_seeker (or unknown — default)  → jobsUrl/dashboard (prod) or /dashboard (dev)
 */

export interface PostLoginDestinationInput {
  isAdmin:           boolean;
  isEmployer:        boolean;
  isJobSeeker:       boolean;
  requestedRedirect: string | null;
  isProdHost:        boolean;
  jobsUrl:           string;
  hiredUrl:          string;
}

export function postLoginDestination(input: PostLoginDestinationInput): string {
  const {
    isAdmin, isEmployer, isJobSeeker,
    requestedRedirect, isProdHost, jobsUrl, hiredUrl,
  } = input;

  if (isAdmin) return "/admin";

  const requested  = (requestedRedirect ?? "").trim();
  const wantsAdmin = requested.startsWith("/admin");
  if (requested && !wantsAdmin) return requested;

  if (isEmployer && isJobSeeker) return "/auth/choose-platform";

  if (isEmployer) {
    return isProdHost ? `${hiredUrl}/dashboard` : "/hired/dashboard";
  }

  void isJobSeeker;
  return isProdHost ? `${jobsUrl}/dashboard` : "/dashboard";
}
