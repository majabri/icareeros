import type { Metadata } from "next";
import { headers } from "next/headers";

import { ConstellationBackground } from "@/components/ConstellationBackground";
import { LandingNav }            from "@/components/landing/LandingNav";
import { RootHeroSection }         from "@/components/landing/RootHeroSection";
import { RootPlatformInnovation }  from "@/components/landing/RootPlatformInnovation";
import { RootJobSeekerSection }    from "@/components/landing/RootJobSeekerSection";
import { RootHiringTeamSection }   from "@/components/landing/RootHiringTeamSection";
import { RootVisionSection }     from "@/components/landing/RootVisionSection";
import { RootCTASection }        from "@/components/landing/RootCTASection";
import { JobsLandingNav }        from "@/components/landing/JobsLandingNav";
import { JobsHeroSection }       from "@/components/landing/JobsHeroSection";
import { JobsPainSection }       from "@/components/landing/JobsPainSection";
import { JobsStagesSection }     from "@/components/landing/JobsStagesSection";
import { JobsFeaturesSection }   from "@/components/landing/JobsFeaturesSection";
import { JobsVisionSection }     from "@/components/landing/JobsVisionSection";
import { JobsCTASection }        from "@/components/landing/JobsCTASection";
import { HireLandingNav }        from "@/components/landing/HireLandingNav";
import { HireHeroSection }       from "@/components/landing/HireHeroSection";
import { HirePathwaySection }    from "@/components/landing/HirePathwaySection";
import { HirePainSection }       from "@/components/landing/HirePainSection";
import { HireWorkflowSection }   from "@/components/landing/HireWorkflowSection";
import { HireFeaturesSection }   from "@/components/landing/HireFeaturesSection";
import { HireVisionSection }     from "@/components/landing/HireVisionSection";
import { HireFAQSection }        from "@/components/landing/HireFAQSection";
import { HireCTASection }        from "@/components/landing/HireCTASection";

/**
 * Root + jobs.* + hire.* landing page.
 *
 * Single page.tsx that renders three variants based on the `x-platform`
 * request header that middleware.ts sets:
 *
 *   icareeros.com         → x-platform = "root"  → <RootLanding/>   (dual-audience)
 *   jobs.icareeros.com    → x-platform = "jobs"  → <JobsLanding/>   (job-seeker only)
 *   hire.icareeros.com /  → x-platform = "hire"  → <HireLanding/>   (employer only, unauthed)
 *
 * Authenticated visits to hire.* `/` are rewritten to /hire/dashboard
 * inside middleware (Phase 4) and never reach this page.tsx — the
 * hire-landing variant is exclusively the unauthenticated employer
 * marketing surface. Every other hire.* path is internally rewritten
 * to /hire/<path> and resolves into the (hire) route group as before.
 *
 * Per COWORK-BRIEF-platform-landing-v1.md (Option A — header-driven
 * branching).
 */

type Platform = "root" | "jobs" | "hire";

async function getPlatform(): Promise<Platform> {
  const h = await headers();
  const value = h.get("x-platform");
  if (value === "jobs" || value === "hire") return value;
  return "root";
}

const ROOT_TITLE = "iCareerOS — The career OS that runs on outcomes, not advice.";
const ROOT_DESC =
  "Six stages. One loop. Real outcomes. iCareerOS is a continuous career operating system — Evaluate, Advise, Learn, Act, Coach, Achieve — that keeps running until you hit your next milestone.";

const JOBS_TITLE = "iCareerOS — Your AI Career Operating System";
const JOBS_DESC  = "Six stages. One loop. Real outcomes for job seekers.";

const HIRE_TITLE = "iCareerOS for Hiring — Find verified talent faster";
const HIRE_DESC  =
  "Search AI-scored candidates who opted in to be discovered. Build your pipeline with iCareerOS.";

export async function generateMetadata(): Promise<Metadata> {
  const platform = await getPlatform();
  if (platform === "jobs") {
    return {
      title: JOBS_TITLE,
      description: JOBS_DESC,
      alternates: { canonical: "https://jobs.icareeros.com" },
      openGraph: {
        title: JOBS_TITLE,
        description: JOBS_DESC,
        url: "https://jobs.icareeros.com",
        siteName: "iCareerOS",
        type: "website",
        locale: "en_US",
      },
    };
  }
  if (platform === "hire") {
    return {
      title: HIRE_TITLE,
      description: HIRE_DESC,
      alternates: { canonical: "https://hire.icareeros.com" },
      openGraph: {
        title: HIRE_TITLE,
        description: HIRE_DESC,
        url: "https://hire.icareeros.com",
        siteName: "iCareerOS",
        type: "website",
        locale: "en_US",
      },
    };
  }
  return {
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
}

export default async function LandingPage() {
  const platform = await getPlatform();
  if (platform === "jobs") return <JobsLanding />;
  if (platform === "hire") return <HireLanding />;
  return <RootLanding />;
}

function RootLanding() {
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

function JobsLanding() {
  return (
    <>
      <ConstellationBackground />
      <div style={{ position: "relative", zIndex: 1 }}>
        <JobsLandingNav />
        <main>
          <JobsHeroSection />
          <JobsPainSection />
          <JobsStagesSection />
          <JobsFeaturesSection />
          <JobsVisionSection />
          <JobsCTASection />
        </main>
      </div>
    </>
  );
}

function HireLanding() {
  return (
    <>
      <ConstellationBackground />
      <div style={{ position: "relative", zIndex: 1 }}>
        <HireLandingNav />
        <main>
          <HireHeroSection />
          <HirePathwaySection />
          <HirePainSection />
          <HireWorkflowSection />
          <HireFeaturesSection />
          <HireVisionSection />
          <HireFAQSection />
          <HireCTASection />
        </main>
      </div>
    </>
  );
}
