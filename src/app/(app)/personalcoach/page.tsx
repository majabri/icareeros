import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Personal Coach — iCareerOS",
};

/**
 * /personalcoach — Personal Coaching directory.
 *
 * 2026-06-18 (T-022) — reverted to a thin Coming Soon placeholder. The
 * full directory page (3 hardcoded coaches, dark-themed cards, mailto CTA)
 * shipped in PR #313 and was rolled back here; scope is TBD pending the
 * vetted-coach partner program. Keep the URL reachable so the sidebar
 * entry doesn't 404; expand back into a real surface in a future PR.
 */

const ADVISE_CORAL = "#FF6B6B"; // Advise stage accent
const TEAL_PRIMARY = "#00B8A9";

export default function PersonalCoachPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <div className="text-center">
        <span
          className="text-[10px] font-bold uppercase tracking-widest"
          style={{ color: ADVISE_CORAL }}
        >
          Stage 2 · Advise
        </span>
        <h2 className="mt-2 text-2xl sm:text-3xl font-black tracking-tight text-gray-900">
          Personal Coach
        </h2>
        <p className="mt-3 max-w-lg mx-auto text-sm text-gray-600">
          Direct work with vetted human career coaches — scheduling, intro
          calls, and ongoing sessions. We&apos;re building the network now.
        </p>

        <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 shadow-sm">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: TEAL_PRIMARY }}
            aria-hidden="true"
          />
          <span className="text-sm font-medium text-gray-700">Coming soon</span>
        </div>

        <p className="mt-10 text-xs text-gray-500">
          Are you a career coach interested in joining our network? Email{" "}
          <a
            href="mailto:coaches@icareeros.com?subject=Join%20the%20iCareerOS%20coach%20network"
            className="font-semibold underline"
            style={{ color: TEAL_PRIMARY }}
          >
            coaches@icareeros.com
          </a>
          .
        </p>
      </div>
    </div>
  );
}
