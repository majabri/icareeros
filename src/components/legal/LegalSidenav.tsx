"use client";

import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/legal/privacy", label: "Privacy Policy" },
  { href: "/legal/terms", label: "Terms of Service" },
  { href: "/legal/cookies", label: "Cookie Policy" },
  { href: "/legal/ai-disclosure", label: "AI Disclosure" },
];

export function LegalSidenav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Legal pages" className="text-sm">
      <ul className="space-y-1">
        {ITEMS.map((it) => {
          const active = pathname?.startsWith(it.href);
          return (
            <li key={it.href}>
              <a
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={`block rounded-lg px-3 py-2 transition-colors ${
                  active
                    ? "bg-brand-50 font-medium text-brand-800"
                    : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                {it.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
