"use client";

import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase";

const NAV_LINKS = [
  { href: "/dashboard",        label: "Career OS",     icon: "🔄" },
  { href: "/jobs",             label: "Opportunities", icon: "💼" },
  { href: "/interview",        label: "Interview",     icon: "🎤" },
  { href: "/resume",           label: "Resume",        icon: "📄" },
  { href: "/offers",           label: "Offers",        icon: "🤝" },
  { href: "/profile",          label: "Profile",       icon: "👤" },
  { href: "/settings/billing", label: "Billing",       icon: "💳" },
];

export function AppNav() {
  const pathname = usePathname();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/auth/login";
  }

  return (
    <nav className="border-b border-gray-200 bg-white shadow-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        {/* Logo */}
        <a href="/dashboard" className="flex items-center gap-2 font-bold text-gray-900 shrink-0">
          <span className="text-blue-600">iCareerOS</span>
        </a>

        {/* Nav links */}
        <div className="flex items-center gap-0.5 overflow-x-auto">
          {NAV_LINKS.map(({ href, label, icon }) => {
            const active =
              pathname === href ||
              (href !== "/dashboard" && pathname.startsWith(href));
            return (
              <a
                key={href}
                href={href}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap
                  ${active
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }`}
              >
                <span aria-hidden="true">{icon}</span>
                <span className="hidden sm:inline">{label}</span>
              </a>
            );
          })}
        </div>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors shrink-0"
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
