"use client";

import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { useTranslation } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export function AppNav() {
  const pathname = usePathname();
  const { t } = useTranslation();

  const NAV_LINKS = [
    { href: "/dashboard",        label: t.nav.careerOS,      icon: "🔄" },
    { href: "/jobs",             label: t.nav.opportunities,  icon: "💼" },
    { href: "/interview",        label: t.nav.interview,      icon: "🎤" },
    { href: "/resume",           label: t.nav.resume,         icon: "📄" },
    { href: "/offers",           label: t.nav.offers,         icon: "🤝" },
    { href: "/recruiter",        label: t.nav.recruiter,      icon: "🔍" },
    { href: "/support",          label: t.nav.support,        icon: "🎫" },
    { href: "/settings",         label: t.nav.settings,       icon: "⚙️" },
  ];

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "https://icareeros.com/";
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

        {/* Right: language switcher + sign out */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden sm:block"><LanguageSwitcher /></span>
          <button
            onClick={handleSignOut}
            className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            title={t.nav.signOut}
            aria-label={t.nav.signOut}
          >
            <span className="hidden sm:inline">{t.nav.signOut}</span>
            <span className="sm:hidden" aria-hidden="true">↩</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
