import type { Metadata } from "next";
import { HiredShell } from "@/components/hired/HiredShell";

/**
 * Phase 3 (2026-05-17) — Layout for the `(hired)` app route group.
 *
 * The middleware rewrites `hire.icareeros.com/*` into this group. The
 * shell (sidebar + top bar + main column) lives in the client-side
 * <HiredShell> component so it can manage the mobile drawer state,
 * highlight the active route via usePathname(), and call supabase
 * auth.signOut() from the top bar / sidebar footer.
 */
export const metadata: Metadata = {
  title: "iCareerOS for Hiring",
};

export default function HiredLayout({ children }: { children: React.ReactNode }) {
  return <HiredShell>{children}</HiredShell>;
}
