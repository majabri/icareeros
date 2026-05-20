import type { Metadata } from "next";
import { headers } from "next/headers";

import { ConstellationBackground } from "@/components/ConstellationBackground";
import { LandingNav }       from "@/components/landing/LandingNav";
import { HeroSection }      from "@/components/landing/HeroSection";
import { ProblemSection }   from "@/components/landing/ProblemSection";
import { LifecycleSection } from "@/components/landing/LifecycleSection";
import { FeaturesSection }  from "@/components/landing/FeaturesSection";
import { FAQSection }       from "@/components/landing/FAQSection";
import { CTASection }       from "@/components/landing/CTASection";
import { JobsLandingNav }   from "@/components/landing/JobsLandingNav";
import { JobsHeroSection }  from "@/components/landing/JobsHeroSection";
import { JobsCTASection }   from "@/components/landing/JobsCTASection";

/**
 * Root + jobs.* landing page.
 *
 * Single page.tsx that renders two variants based on the `x-platform`
 * request header that middleware.ts sets (`root` for icareeros.com,
 * `jobs` for jobs.icareeros.com). hire.icareeros.com never reaches
 * this route — middleware rewrites every non-/api, non-/auth path
 * under hire.* into the (hire) route group.
 *
 * Per COWORK-BRIEF-platform-landing-v1.md (Option A — header-driven
 * branching) — keeps the diff small, avoids a route-group split,
 * lets per-host metadata be served via Next 15 generateMetadata().
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
  return platform === "jobs" ? <JobsLanding /> : <RootLanding />;
}

function RootLanding() {
  return (
    <>
      <ConstellationBackground />
      <div style={{ position: "relative", zIndex: 1 }}>
        <LandingNav />
        <main>
          <HeroSection />
          <ProblemSection />
          <LifecycleSection />
          <FeaturesSection />
          <FAQSection />
          <CTASection />
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
          <ProblemSection />
          <LifecycleSection />
          <FeaturesSection />
          <FAQSection />
          <JobsCTASection />
        </main>
      </div>
    </>
  );
}
