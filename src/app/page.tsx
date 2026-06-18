import type { Metadata } from "next";
import { headers } from "next/headers";

import { ConstellationBackground } from "@/components/ConstellationBackground";
import { LandingNav }              from "@/components/landing/LandingNav";
import { RootHeroSection }         from "@/components/landing/RootHeroSection";
import { RootPlatformInnovation }  from "@/components/landing/RootPlatformInnovation";
import { RootVisionSection }       from "@/components/landing/RootVisionSection";
import { RootCTASection }          from "@/components/landing/RootCTASection";
import { JobsLanding }             from "@/components/landing/JobsLanding";
import { HireLanding }             from "@/components/landing/HireLanding";

/**
 * Top-level landing page — branches on the `x-platform` middleware header.
 *
 * Per COWORK-BRIEF-platform-subdomain-landings-v2 (2026-06-17):
 * the two audience deep-dive sections (RootJobSeekerSection,
 * RootHiringTeamSection) now live ONLY inside JobsLanding and
 * HireLanding — root becomes a thin platform front door (hero,
 * 2-column outbound overview, vision, CTA).
 *
 * Per COWORK-BRIEF-platform-subdomain-landings-v1 (2026-05-27, PR #300)
 * the Phase 5 collapse was reversed: jobs.* and hire.* unauthenticated
 * `/` no longer 308-redirect to root anchors but render their own
 * standalone landings.
 *
 * x-platform values come from `platformFromHost` in middleware.ts:
 *   - "jobs"  → JobsLanding (For Job Seekers, full page)
 *   - "hire"  → HireLanding (For Hiring Teams, full page)
 *   - "root"  → RootLanding (the dual-audience marketing page)
 *
 * Authenticated subdomain visitors never reach this page — middleware
 * redirects them to /dashboard (jobs) or rewrites to /hire/dashboard
 * (hire) before getting here.
 */

const ROOT_TITLE = "iCareerOS — The career OS that runs on outcomes, not advice.";
const ROOT_DESC =
  "Six stages. One loop. Real outcomes. iCareerOS is a continuous career operating system — Evaluate, Advise, Learn, Act, Coach, Achieve — that keeps running until you hit your next milestone.";

export const metadata: Metadata = {
  title: ROOT_TITLE,
  description: ROOT_DESC,
  alternates: { canonical: "https://icareeros.com" },
  openGraph: {
    title: ROOT_TITLE,
    description: "Six stages. One loop. Real outcomes. Evaluate → Advise → Learn → Act → Coach → Achieve → repeat.",
    url: "https://icareeros.com",
    siteName: "iCareerOS",
    type: "website",
    locale: "en_US",
  },
};

export default async function LandingPage() {
  const platform = (await headers()).get("x-platform");

  if (platform === "jobs") {
    return <JobsLanding />;
  }
  if (platform === "hire") {
    return <HireLanding />;
  }

  // Root marketing surface — the dual-audience page at icareeros.com
  return (
    <>
      <ConstellationBackground />
      <div style={{ position: "relative", zIndex: 1 }}>
        <LandingNav />
        <main>
          <RootHeroSection />
          <RootPlatformInnovation />
          <RootVisionSection />
          <RootCTASection />
        </main>
      </div>
    </>
  );
}
