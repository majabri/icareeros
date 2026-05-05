"use client";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/settings/account",         label: "Account" },
  { href: "/settings/linked-accounts", label: "Linked Accounts" },
  { href: "/settings/security",        label: "Security & Compliance" },
  { href: "/settings/email",           label: "Notifications" },
  { href: "/settings/billing",         label: "Billing" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav className="mb-8 flex gap-0 border-b border-gray-200 text-sm overflow-x-auto">
      {TABS.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <a
            key={href}
            href={href}
            className={`whitespace-nowrap border-b-2 px-4 pb-3 font-medium transition-colors
              ${active
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }`}
          >
            {label}
          </a>
        );
      })}
    </nav>
  );
}
