import { ConstellationBackground } from "@/components/ConstellationBackground";
import { JobsLandingNav } from "@/components/landing/JobsLandingNav";
import { RootJobSeekerSection } from "@/components/landing/RootJobSeekerSection";

/**
 * JobsLanding — full standalone landing for jobs.icareeros.com.
 *
 * Per COWORK-BRIEF-platform-subdomain-landings-v1 (2026-05-27): jobs.* gets
 * its own landing surface (no longer 308-redirected to icareeros.com root
 * anchor). The For-Job-Seekers content lives in RootJobSeekerSection — that
 * component already carries the approved copy verbatim (locked in PR #290).
 */
export function JobsLanding() {
  return (
    <>
      <ConstellationBackground />
      <div style={{ position: "relative", zIndex: 1 }}>
        <JobsLandingNav />
        <main>
          <RootJobSeekerSection />
        </main>
      </div>
    </>
  );
}
