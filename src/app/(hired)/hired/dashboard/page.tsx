import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Dashboard — iCareerOS for Hiring" };

/**
 * Phase 1 subdomain (2026-05-16) — stub dashboard for hired.icareeros.com.
 * Coming-soon copy from the brief. Phase 2 ships the actual recruiter
 * product (candidate search, JD analysis, outreach).
 */
export default function HiredDashboardPage() {
  return (
    <div
      style={{
        minHeight: "calc(100vh - 73px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "3rem 1.5rem",
      }}
    >
      <div
        style={{
          maxWidth: 640,
          background: "#142238",
          border: "1px solid #1F2E48",
          borderRadius: 18,
          padding: "3rem 2.5rem",
          textAlign: "center",
          boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
        }}
      >
        <div aria-hidden style={{ fontSize: "3.25rem", marginBottom: "1rem" }}>🏢</div>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#E5EEFA", marginBottom: "0.25rem" }}>
          hired.icareeros.com
        </h1>
        <p style={{ color: "#7BD6C9", fontSize: "0.95rem", marginBottom: "1.5rem", fontWeight: 600 }}>
          Find exceptional talent — coming soon.
        </p>
        <p style={{ color: "#A5B5CF", fontSize: "0.95rem", lineHeight: 1.65, marginBottom: "2rem" }}>
          We&apos;re building the recruiter side of iCareerOS. Job seeker profiles, skill matching,
          and candidate outreach will be available here shortly.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", alignItems: "center" }}>
          <a
            href="mailto:hello@icareeros.com?subject=Early%20access%20%E2%80%94%20iCareerOS%20for%20Hiring"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              background: "#7BD6C9",
              color: "#0B1422",
              padding: "0.7rem 1.5rem",
              borderRadius: 12,
              textDecoration: "none",
              fontWeight: 600,
              fontSize: "0.95rem",
            }}
          >
            Get early access →
          </a>
          <Link
            href="/recruiter"
            style={{
              color: "#E5EEFA",
              textDecoration: "underline",
              fontSize: "0.9rem",
            }}
          >
            Analyse a job description →
          </Link>
        </div>

        <hr style={{ border: "none", borderTop: "1px solid #1F2E48", margin: "2rem 0 1.5rem" }} />

        <p style={{ color: "#A5B5CF", fontSize: "0.85rem", marginBottom: "0.5rem" }}>
          Already have an account?
        </p>
        <a
          href={`${process.env.NEXT_PUBLIC_JOBS_URL ?? "https://jobs.icareeros.com"}/dashboard`}
          style={{
            color: "#7BD6C9",
            textDecoration: "underline",
            fontWeight: 600,
            fontSize: "0.9rem",
          }}
        >
          Sign in to iCareerOS for Jobs →
        </a>
      </div>
    </div>
  );
}
