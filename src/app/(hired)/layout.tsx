import type { Metadata } from "next";
import Link from "next/link";

/**
 * Phase 1 subdomain (2026-05-16) — Layout for the `(hired)` app route
 * group, which the middleware rewrites `hired.icareeros.com/*` into.
 *
 * Minimal shell: dark navy background, single top nav with the
 * iCareerOS for Hiring wordmark, two disabled (coming-soon) nav items,
 * and Sign out. No sidebar. Recruiter product features land in Phase 2;
 * this layout exists so the stub dashboard has somewhere to live and
 * so the URL surface (hired.icareeros.com/dashboard) resolves cleanly.
 */
export const metadata: Metadata = {
  title: "iCareerOS for Hiring",
};

export default function HiredLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#0F1B2D", color: "#E5EEFA", minHeight: "100vh" }}>
      <header
        style={{
          background: "#0B1422",
          borderBottom: "1px solid #1F2E48",
          padding: "1rem 1.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
        }}
      >
        <Link
          href="/hired/dashboard"
          style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", textDecoration: "none", color: "#E5EEFA" }}
          aria-label="iCareerOS for Hiring — home"
        >
          <span aria-hidden style={{ fontSize: "1.5rem" }}>⬢</span>
          <span style={{ fontWeight: 700, letterSpacing: "0.5px" }}>
            iCareerOS <span style={{ color: "#7BD6C9", fontWeight: 600 }}>for Hiring</span>
          </span>
        </Link>

        <nav style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
          <button
            type="button"
            disabled
            title="Coming soon"
            style={{
              background: "transparent",
              border: "1px solid #243653",
              color: "#7C8FB0",
              padding: "0.4rem 0.85rem",
              borderRadius: "999px",
              fontSize: "0.85rem",
              cursor: "not-allowed",
            }}
          >
            Find Talent — coming soon
          </button>
          <button
            type="button"
            disabled
            title="Coming soon"
            style={{
              background: "transparent",
              border: "1px solid #243653",
              color: "#7C8FB0",
              padding: "0.4rem 0.85rem",
              borderRadius: "999px",
              fontSize: "0.85rem",
              cursor: "not-allowed",
            }}
          >
            Post a Job — coming soon
          </button>
          <Link
            href="/auth/login"
            style={{
              color: "#E5EEFA",
              textDecoration: "none",
              fontSize: "0.9rem",
              fontWeight: 500,
            }}
          >
            Sign out
          </Link>
        </nav>
      </header>

      <main>{children}</main>
    </div>
  );
}
