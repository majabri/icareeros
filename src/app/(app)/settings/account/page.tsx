/**
 * /settings/account — Account
 *
 * Auth/account-level information ONLY. Read-only.
 *
 * Per Amir 2026-05-03 — this page is fully independent from /mycareer/profile.
 * It does NOT read from or write to `user_profiles`. Career identity (name,
 * phone, location, headline, summary, work history, education, skills, certs,
 * portfolio) is owned by /mycareer/profile and edited there only.
 */
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  } catch { return "—"; }
}

function Row({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-3 sm:gap-4 py-3 border-b border-gray-100 last:border-0">
      <dt className="text-sm font-medium text-gray-600">{label}</dt>
      <dd className={`text-sm text-gray-900 sm:col-span-2 ${mono ? "font-mono text-xs break-all" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

export default function AccountPage() {
  const supabase = createClient();
  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        setUser(data.user);
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
    </div>
  );

  if (!user) return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <p className="text-sm text-gray-600">Not signed in.</p>
    </section>
  );

  const provider = user.app_metadata?.provider ?? "email";

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <header className="mb-4">
          <h2 className="text-base font-semibold text-gray-900">Account</h2>
          <p className="mt-1 text-sm text-gray-500">
            Read-only information about your sign-in account. To edit your
            name, phone, location, headline, or other career details,
            visit your{" "}
            <Link href="/mycareer/profile" className="text-brand-600 hover:text-brand-700 font-medium underline-offset-2 hover:underline">
              Career Profile
            </Link>.
          </p>
        </header>

        <dl>
          <Row label="Email" value={user.email ?? "—"} />
          <Row label="Email confirmed" value={user.email_confirmed_at ? "Yes" : "Not yet — check your inbox"} />
          <Row label="Sign-in method" value={provider.charAt(0).toUpperCase() + provider.slice(1)} />
          <Row label="Member since" value={fmtDate(user.created_at)} />
          <Row label="Last sign-in" value={fmtDate(user.last_sign_in_at)} />
          <Row label="User ID" value={user.id} mono />
        </dl>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900">Manage elsewhere</h3>
        <p className="mt-1 text-xs text-gray-500">Each area owns its own settings — no field is edited in two places.</p>
        <ul className="mt-4 space-y-2 text-sm">
          <li>
            <Link href="/mycareer/profile" className="text-brand-600 hover:text-brand-700 font-medium">Career Profile</Link>
            <span className="text-gray-500"> — name, phone, LinkedIn, location, headline, summary, work, education, skills, certifications, portfolio, resume export.</span>
          </li>
          <li>
            <Link href="/settings/security" className="text-brand-600 hover:text-brand-700 font-medium">Security &amp; Compliance</Link>
            <span className="text-gray-500"> — password change, data export, account deletion.</span>
          </li>
          <li>
            <Link href="/settings/email" className="text-brand-600 hover:text-brand-700 font-medium">Notifications</Link>
            <span className="text-gray-500"> — email preferences.</span>
          </li>
          <li>
            <Link href="/settings/billing" className="text-brand-600 hover:text-brand-700 font-medium">Billing</Link>
            <span className="text-gray-500"> — plan and payment.</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
