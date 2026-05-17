import type { Metadata } from "next";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { withCrossSubdomainCookie } from "@/lib/supabase-cookie-options";

export const metadata: Metadata = {
  title: "Choose your platform — iCareerOS",
};

/**
 * Phase 1 subdomain (2026-05-16) — Dual-role chooser.
 *
 * The middleware redirects users with BOTH `job_seeker` and `employer`
 * rows in `user_roles` here after sign-in. Two large buttons; selecting
 * one navigates to the relevant subdomain. No "remember my choice" —
 * shown every time the user logs in until that's added in a later phase.
 *
 * If the user only has one role they shouldn't land here (the middleware
 * would have already redirected). As a defensive measure the buttons
 * still link out, so even a direct visit works.
 */
export default async function ChoosePlatformPage() {
  const jobsUrl  = process.env.NEXT_PUBLIC_JOBS_URL  ?? "https://jobs.icareeros.com";
  const hiredUrl = process.env.NEXT_PUBLIC_HIRED_URL ?? "https://hired.icareeros.com";

  // Best-effort fetch of the user's first name to personalize the greeting.
  // RLS-protected; falls back to a generic salutation on any error.
  let firstName: string | null = null;
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cs: Array<{ name: string; value: string; options: CookieOptions }>) {
            cs.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, withCrossSubdomainCookie(options)),
            );
          },
        },
      },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .maybeSingle();
      const full = typeof profile?.full_name === "string" ? profile.full_name.trim() : "";
      if (full.length > 0) firstName = full.split(/\s+/)[0];
    }
  } catch {
    // Ignore — render with the generic greeting.
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-transparent px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">
            {firstName ? `Welcome back, ${firstName}.` : "Welcome back."}
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            You have access to both platforms. Where would you like to go?
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <a
            href={`${jobsUrl}/dashboard`}
            className="block rounded-2xl border-2 border-gray-200 bg-white p-6 text-left shadow-sm hover:border-brand-400 hover:shadow-md transition-all"
          >
            <div className="text-3xl" aria-hidden>🎯</div>
            <div className="mt-3 text-base font-semibold text-gray-900">
              iCareerOS for Jobs
            </div>
            <p className="mt-2 text-sm text-gray-600 leading-snug">
              Career OS, coaching, job search, interview prep, and salary
              negotiation.
            </p>
            <div className="mt-4 text-sm font-semibold text-brand-700">
              Go to jobs.icareeros.com →
            </div>
          </a>

          <a
            href={`${hiredUrl}/dashboard`}
            className="block rounded-2xl border-2 border-gray-200 bg-white p-6 text-left shadow-sm hover:border-brand-400 hover:shadow-md transition-all"
          >
            <div className="text-3xl" aria-hidden>🏢</div>
            <div className="mt-3 text-base font-semibold text-gray-900">
              iCareerOS for Hiring
            </div>
            <p className="mt-2 text-sm text-gray-600 leading-snug">
              Find talent, post jobs, analyse job descriptions, and run outreach.
            </p>
            <div className="mt-4 text-sm font-semibold text-brand-700">
              Go to hired.icareeros.com →
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}
