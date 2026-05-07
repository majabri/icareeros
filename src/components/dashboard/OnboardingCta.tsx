"use client";

/**
 * OnboardingCta — top-of-dashboard banner shown to brand-new users whose
 * career_profiles row is missing or thin (no headline, fewer than 3 skills).
 *
 * Phase 5 Item 2 — see docs/specs/COWORK-BRIEF-phase5-v1.md.
 *
 * Why this exists: a fresh signup lands on /dashboard with `cycle = null`,
 * sees the "+ Start a cycle" card, clicks it, and gets a cycle whose
 * Evaluate stage cannot actually run because there's no profile to evaluate.
 * This banner short-circuits that confusion by routing to /mycareer/profile
 * BEFORE the user starts a cycle — and continues to nag if a cycle exists
 * but the profile is still empty.
 */

import Link from "next/link";

export interface OnboardingCtaProps {
  /** True iff the user has both a non-empty headline AND skills.length >= 3. */
  profileReady: boolean;
  /** Whether the user already has an active cycle. Affects banner copy. */
  hasActiveCycle: boolean;
  className?: string;
}

export function OnboardingCta({ profileReady, hasActiveCycle, className }: OnboardingCtaProps) {
  if (profileReady) return null;

  const headline = hasActiveCycle
    ? "Finish your Career Profile so Evaluate can score you"
    : "Start by building your Career Profile";

  const body = hasActiveCycle
    ? "Your active cycle's Evaluate stage needs a headline and at least 3 skills before AI can run a meaningful assessment."
    : "Add a headline, target role, and a few skills so each stage of the Career OS has real material to work with.";

  return (
    <div
      data-testid="onboarding-cta"
      className={
        "rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50 p-5 " +
        (className ?? "")
      }
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl" aria-hidden="true">👋</span>
          <div>
            <h3 className="text-base font-semibold text-brand-900">{headline}</h3>
            <p className="mt-1 text-sm text-brand-800">{body}</p>
          </div>
        </div>
        <Link
          href="/mycareer/profile"
          className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Build profile →
        </Link>
      </div>
    </div>
  );
}
