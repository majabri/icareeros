import type { Metadata } from "next";
import { PlatformShell } from "@/components/shell/PlatformShell";
import { HIRE_CONFIG }   from "@/components/shell/platform.config";

/**
 * hire.icareeros.com layout.
 *
 * Uses the unified PlatformShell with the config-driven sidebar (flat
 * nav). The previous HireShell.tsx was retired by feat/unified-platform-shell
 * — its visuals + behaviour are now provided by PlatformShell + HIRE_CONFIG.
 */
export const metadata: Metadata = {
  title: "iCareerOS for Hiring",
};

export default function HireLayout({ children }: { children: React.ReactNode }) {
  return <PlatformShell config={HIRE_CONFIG}>{children}</PlatformShell>;
}
