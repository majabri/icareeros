"use client";

/**
 * SettingsNav — 4-item top nav shown at the top of every hire settings page.
 *
 *   Account  ·  Privacy  ·  Billing  ·  Security
 *
 * Per COWORK-BRIEF-hire-settings-pages-v1: active-state colour comes
 * from `BRAND_COLORS.teal` (the primary brand colour from the design-
 * tokens single source of truth — no hardcoded hex in this file).
 *
 * Tabler icons are the icon system PR #279 standardised on:
 *   - Account   IconUser
 *   - Privacy   IconEye
 *   - Billing   IconCreditCard
 *   - Security  IconShield
 *
 * Each entry is a Next.js <Link>; active is determined by usePathname()
 * prefix-matching against the entry's href.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconUser,
  IconEye,
  IconCreditCard,
  IconShield,
  type Icon,
} from "@tabler/icons-react";
import { BRAND_COLORS } from "@/lib/design-tokens";

interface NavEntry {
  href:  string;
  label: string;
  Icon:  Icon;
}

const ENTRIES: readonly NavEntry[] = [
  { href: "/settings/account",   label: "Account",  Icon: IconUser },
  { href: "/settings/privacy",   label: "Privacy",  Icon: IconEye },
  { href: "/settings/billing",   label: "Billing",  Icon: IconCreditCard },
  { href: "/settings/security",  label: "Security", Icon: IconShield },
];

export function SettingsNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav
      aria-label="Settings sections"
      style={{
        display:      "flex",
        gap:          "0.25rem",
        marginBottom: "1.5rem",
        borderBottom: "1px solid var(--surface-border, #E5E7EB)",
        overflowX:    "auto",
      }}
    >
      {ENTRIES.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            style={{
              display:        "inline-flex",
              alignItems:     "center",
              gap:            "0.4rem",
              padding:        "0.6rem 0.85rem",
              fontSize:       "0.88rem",
              fontWeight:     active ? 700 : 500,
              color:          active ? BRAND_COLORS.teal : "var(--text-muted, #64748B)",
              borderBottom:   active
                ? `2px solid ${BRAND_COLORS.teal}`
                : "2px solid transparent",
              marginBottom:   "-1px", // overlap parent border
              textDecoration: "none",
              whiteSpace:     "nowrap",
              transition:     "color 120ms ease",
            }}
          >
            <Icon size={16} stroke={1.75} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default SettingsNav;
