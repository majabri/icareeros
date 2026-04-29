/**
 * /admin — feature-flag control panel
 *
 * Server Component: fetches flags from Supabase directly, then hands off
 * to the FeatureFlagToggle client component for interactive toggling.
 *
 * Only accessible to majabri714@gmail.com — anyone else is redirected to /dashboard.
 */

import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { FeatureFlagToggle } from "@/components/admin/FeatureFlagToggle";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin — iCareerOS",
};

const ADMIN_EMAIL = "majabri714@gmail.com";

async function makeSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: Array<{
            name: string;
            value: string;
            options: CookieOptions;
          }>
        ) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}

export default async function AdminPage() {
  const supabase = await makeSupabaseServer();

  // Auth guard
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?redirect=/admin");
  if (user.email !== ADMIN_EMAIL) redirect("/dashboard");

  // Load feature flags
  const { data: flags, error } = await supabase
    .from("feature_flags")
    .select("key, enabled, updated_at")
    .order("key");

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <p className="text-red-600">Failed to load feature flags: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage feature flags and platform settings.
        </p>
      </div>

      {/* Feature Flags section */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Feature Flags</h2>
          <span className="text-xs text-gray-400">{flags?.length ?? 0} flags</span>
        </div>
        <FeatureFlagToggle initial={flags ?? []} />
      </section>

      {/* Quick links */}
      <section className="mt-10 border-t border-gray-100 pt-8">
        <h2 className="mb-4 text-lg font-semibold text-gray-800">Quick Links</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            {
              label: "Supabase",
              href: "https://supabase.com/dashboard/project/kuneabeiwcxavvyyfjkx",
            },
            {
              label: "Vercel",
              href: "https://vercel.com/jabri-solutions/icareeros/settings/environment-variables",
            },
            {
              label: "Stripe",
              href: "https://dashboard.stripe.com/acct_1TK0yp2K7LVuzb7t/dashboard",
            },
          ].map(({ label, href }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-center text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 hover:text-gray-900 transition-colors"
            >
              {label} ↗
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
