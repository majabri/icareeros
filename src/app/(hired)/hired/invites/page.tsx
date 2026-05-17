import type { Metadata } from "next";
import Link from "next/link";

/**
 * Phase 3 (2026-05-17) — Invites Sent stub.
 *
 * Placeholder for the talent_invites history view. Sidebar nav already
 * points here; the full inbox + status filter UI lands after employer
 * profile setup adoption is measured.
 */
export const metadata: Metadata = { title: "Invites Sent — iCareerOS for Hiring" };

export default function HiredInvitesStubPage() {
  return (
    <div style={{ padding: "3rem 1.5rem", maxWidth: 720, margin: "0 auto", color: "#E5EEFA" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0 }}>Invites Sent</h1>
      <p style={{ marginTop: "0.75rem", color: "#7B9AC0", lineHeight: 1.55 }}>
        Coming soon. A unified inbox showing every candidate you&apos;ve invited,
        their response status, and follow-up reminders.
      </p>
      <div
        style={{
          marginTop:    "1.75rem",
          background:   "#1A2D45",
          border:       "1px solid #1F2E48",
          borderRadius: 12,
          padding:      "1.25rem",
        }}
      >
        <p style={{ margin: 0, fontWeight: 600 }}>Ready to invite more candidates?</p>
        <p style={{ marginTop: "0.5rem", marginBottom: "1rem", color: "#7B9AC0" }}>
          Find the right people on Find Talent and send your first outreach.
        </p>
        <Link
          href="/hired/dashboard"
          style={{
            display:        "inline-flex",
            alignItems:     "center",
            padding:        "0.5rem 1rem",
            background:     "#00B8A9",
            color:          "#0B1422",
            fontWeight:     600,
            textDecoration: "none",
            borderRadius:   8,
          }}
        >
          Open Find Talent →
        </Link>
      </div>
    </div>
  );
}
