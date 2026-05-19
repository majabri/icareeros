"use client";

/**
 * jobs.icareeros.com layout.
 *
 * Uses the unified PlatformShell for the chrome (ConstellationBackground +
 * top bar + mobile drawer state) and supplies AppSidebar via the
 * `customSidebar` slot so the rich career-OS sidebar (6 stages, status
 * gating, mobile expand-collapse, marketplace section) stays specialized
 * and unchanged. The chrome is now shared with hire.icareeros.com.
 */

import { useState } from "react";
import { PlatformShell } from "@/components/shell/PlatformShell";
import { JOBS_CONFIG }   from "@/components/shell/platform.config";
import { AppSidebar }    from "@/components/AppSidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <PlatformShell
      config={JOBS_CONFIG}
      customSidebar={
        <AppSidebar
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
        />
      }
    >
      {children}
    </PlatformShell>
  );
}
