import type { Metadata } from "next";
import { HireShell } from "@/components/hire/HireShell";

/**
 * Phase 3 (2026-05-17) — Layout for the `(hire)` app route group.
 *
 * The middleware rewrites `hire.icareeros.com/*` into this group. The
 * shell (sidebar + top bar + main column) lives in the client-side
 * <HireShell> component so it can manage the mobile drawer state,
 * highlight the active route via usePathname(), and call supabase
 * auth.signOut() from the top bar / sidebar footer.
 */
export const metadata: Metadata = {
  title: "iCareerOS for Hiring",
};

export default function HireLayout({ children }: { children: React.ReactNode }) {
  return <HireShell>{children}</HireShell>;
}
