"use client";

import { useState } from "react";
import { ConstellationBackground } from "@/components/ConstellationBackground";
import { AppTopBar }               from "@/components/AppTopBar";
import { AppSidebar }              from "@/components/AppSidebar";

const TOP_BAR_H = 56; // px — must match AppTopBar height

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* ── Constellation: fixed behind everything ─────────────────── */}
      <ConstellationBackground />

      {/* ── All app chrome sits above the constellation ─────────────── */}
      <div style={{ position: "relative", zIndex: 1 }}>

        {/* Persistent top bar */}
        <AppTopBar onMenuClick={() => setMobileOpen(true)} />

        {/* Sidebar + page content, pushed below the top bar */}
        <div
          className="flex"
          style={{ paddingTop: TOP_BAR_H, minHeight: "100vh" }}
        >
          <AppSidebar
            mobileOpen={mobileOpen}
            setMobileOpen={setMobileOpen}
          />
          <main
            id="main-content"
            tabIndex={-1}
            className="flex-1 min-w-0 outline-none"  /* Safari fix: removed overflow-y-auto so body scrolls, position:sticky on sidebar resolves correctly, click hit-tests align with rendered UI */
          >
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
