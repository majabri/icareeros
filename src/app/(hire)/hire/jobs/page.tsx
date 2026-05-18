import type { Metadata } from "next";
import Link from "next/link";

/**
 * Phase 3 (2026-05-17) — Job Postings stub.
 *
 * Surfaces a destination for the sidebar nav item before the real
 * employer job-posting flow ships. Matches the (hire) shell visual
 * system (navy + slate + teal).
 */
export const metadata: Metadata = { title: "Job Postings — iCareerOS for Hiring" };

export default function HireJobsStubPage() {
  return (
    <div style={{ padding: "3rem 1.5rem", maxWidth: 720, margin: "0 auto", color: "#E5EEFA" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0 }}>Job Postings</h1>
      <p style={{ marginTop: "0.75rem", color: "#7B9AC0", lineHeight: 1.55 }}>
        Coming soon. Post a job, manage candidates, and track your hiring funnel
        — all from one place. We&apos;re building this next.
      </p>
      <div
        style={{
          marginTop: "1.75rem",
          background:   "#1A2D45",
          border:       "1px solid #1F2E48",
          borderRadius: 12,
          padding:      "1.25rem",
        }}
      >
        <p style={{ margin: 0, fontWeight: 600 }}>
          In the meantime, you can already find talent.
        </p>
        <p style={{ marginTop: "0.5rem", marginBottom: "1rem", color: "#7B9AC0" }}>
          Search profiles by skill, role, and location — and invite candidates
          directly.
        </p>
        <Link
          href="/hire/dashboard"
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
