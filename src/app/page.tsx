import type { Metadata } from "next";

import { ConstellationBackground } from "@/components/ConstellationBackground";
import { LandingNav }              from "@/components/landing/LandingNav";
import { RootHeroSection }         from "@/components/landing/RootHeroSection";
import { RootPlatformInnovation }  from "@/components/landing/RootPlatformInnovation";
import { RootJobSeekerSection }    from "@/components/landing/RootJobSeekerSection";
import { RootHiringTeamSection }   from "@/components/landing/RootHiringTeamSection";
import { RootVisionSection }       from "@/components/landing/RootVisionSection";
import { RootCTASection }          from "@/components/landing/RootCTASection";

/**
 * Root landing page at icareeros.com.
 *
 * Per Amir 2026-05-20 (Phase 5, PRs #268 + #269) the unauthenticated
 * marketing surface lives ONLY here. The previous jobs.* and hire.*
 * landings were collapsed into this single page; visitors hitting
 * jobs.icareeros.com/ or hire.icareeros.com/ unauthenticated are
 * 308-redirected by middleware to the corresponding section anchor
 * here (#job-seekers / #hiring-teams).
 *
 * As a result the page no longer needs platform branching — every
 * unauthenticated `/` resolves to <RootLanding/>. The earlier Option-A
 * header-driven branch on the `x-platform` middleware header (from
 * PRs #263/#264) is retired alongside the orphan Jobs* / Hire*
 * landing components that backed it.
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

export default function LandingPage() {
  return (
    <>
      <ConstellationBackground />
      <div style={{ position: "relative", zIndex: 1 }}>
        <LandingNav />
        <main>
          <RootHeroSection />
          <RootPlatformInnovation />
          <RootJobSeekerSection />
          <RootHiringTeamSection />
          <RootVisionSection />
          <RootCTASection />
        </main>
      </div>
    </>
  );
}
