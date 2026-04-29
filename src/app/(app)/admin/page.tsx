/**
 * /admin — feature-flag control panel + support ticket queue
 *
 * Server Component: fetches flags + tickets from Supabase directly.
 * Only accessible to majabri714@gmail.com — anyone else is redirected to /dashboard.
 */

import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { FeatureFlagToggle } from "@/components/admin/FeatureFlagToggle";
import type { Metadata } from "next";
import type { TicketPriority, TicketStatus } from "@/services/supportService";
import { statusBadgeClass, statusLabel, priorityBadgeClass } from "@/services/supportService";

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

interface AdminTicket {
  id: string;
  subject: string;
  body: string;
  priority: TicketPriority;
  status: TicketStatus;
  created_at: string;
  user_id: string;
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
  const { data: flags, error: flagsError } = await supabase
    .from("feature_flags")
    .select("key, enabled, updated_at")
    .order("key");

  // Load open support tickets (newest first, limit 50)
  const { data: tickets } = await supabase
    .from("support_tickets")
    .select("id, subject, body, priority, status, created_at, user_id")
    .in("status", ["open", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(50);

  if (flagsError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <p className="text-red-600">Failed to load feature flags: {flagsError.message}</p>
      </div>
    );
  }

  const openTickets = (tickets ?? []) as AdminTicket[];

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage feature flags, support tickets, and platform settings.
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

      {/* Support Tickets section */}
      <section className="mt-10 border-t border-gray-100 pt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Open Support Tickets</h2>
          <span className="text-xs text-gray-400">{openTickets.length} tickets</span>
        </div>

        {openTickets.length === 0 ? (
          <p className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
            🎉 No open tickets — inbox is clear.
          </p>
        ) : (
          <ul className="space-y-3">
            {openTickets.map(ticket => (
              <li
                key={ticket.id}
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(ticket.status)}`}
                  >
                    {statusLabel(ticket.status)}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${priorityBadgeClass(ticket.priority)}`}
                  >
                    {ticket.priority}
                  </span>
                  <span className="ml-auto text-xs text-gray-400">
                    {new Date(ticket.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-sm font-medium text-gray-900">{ticket.subject}</p>
                <p className="mt-1 text-xs text-gray-500 line-clamp-3">{ticket.body}</p>
                <p className="mt-2 font-mono text-xs text-gray-400">uid: {ticket.user_id}</p>
              </li>
            ))}
          </ul>
        )}
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
