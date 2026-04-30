"use client";

import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { useTranslation } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export function AppNav() {
  const pathname = usePathname();
  const { t } = useTranslation();

  const NAV_LINKS = [
    { href: "/dashboard",  label: t.nav.careerOS,     icon: "🔄", shortLabel: "Career"    },
    { href: "/jobs",       label: t.nav.opportunities, icon: "💼", shortLabel: "Jobs"      },
    { href: "/interview",  label: t.nav.interview,     icon: "🎤", shortLabel: "Interview" },
    { href: "/resume",     label: t.nav.resume,        icon: "🎯", shortLabel: "Fit"       },
    { href: "/offers",     label: t.nav.offers,        icon: "🤝", shortLabel: "Offers"    },
    { href: "/recruiter",  label: t.nav.recruiter,     icon: "🔍", shortLabel: "Recruit"   },
    { href: "/settings",   label: t.nav.settings,      icon: "👤", shortLabel: "My Career" },
  ];

  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "https://icareeros.com/";
  }

  return (
    <>
      {/* ── Desktop / tablet top nav (sm and above) ──────────────────── */}
      <nav className="hidden sm:block border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          {/* Logo */}
          <a href="/dashboard" className="flex items-center gap-2 font-bold text-gray-900 shrink-0">
            <span className="text-blue-600">iCareerOS</span>
          </a>

          {/* Nav links */}
          <div className="flex items-center gap-0.5 overflow-x-auto">
            {NAV_LINKS.map(({ href, label, icon }) => (
              <a
                key={href}
                href={href}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap
                  ${isActive(href)
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }`}
              >
                <span aria-hidden="true">{icon}</span>
                <span className="hidden lg:inline">{label}</span>
              </a>
            ))}
          </div>

          {/* Right: language switcher + sign out */}
          <div className="flex items-center gap-2 shrink-0">
            <LanguageSwitcher />
            <button
              onClick={handleSignOut}
              className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              title={t.nav.signOut}
              aria-label={t.nav.signOut}
            >
              {t.nav.signOut}
            </button>
          </div>
        </div>
      </nav>

      {/* ── Mobile top bar (below sm) — logo + sign out only ─────────── */}
      <nav className="flex sm:hidden items-center justify-between border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        <a href="/dashboard" className="font-bold text-blue-600 text-lg">
          iCareerOS
        </a>
        <button
          onClick={handleSignOut}
          className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 transition-colors"
          aria-label={t.nav.signOut}
        >
          ↩
        </button>
      </nav>

      {/* ── Mobile bottom tab bar (below sm) ─────────────────────────── */}
      <div
        className="fixed bottom-0 inset-x-0 z-50 border-t border-gray-200 bg-white sm:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex overflow-x-auto scrollbar-hide">
          {NAV_LINKS.map(({ href, icon, shortLabel }) => {
            const active = isActive(href);
            return (
              <a
                key={href}
                href={href}
                className={`flex min-w-[56px] flex-1 flex-col items-center gap-0.5 px-1 py-2 transition-colors
                  ${active ? "text-blue-600" : "text-gray-400 hover:text-gray-600"}`}
              >
                <span className="text-xl leading-none" aria-hidden="true">{icon}</span>
                <span className={`text-[9px] font-medium truncate max-w-[52px] text-center leading-tight
                  ${active ? "text-blue-600" : "text-gray-400"}`}>
                  {shortLabel}
                </span>
              </a>
            );
          })}
        </div>
      </div>
    </>
  );
}
