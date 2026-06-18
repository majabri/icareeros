import { ConstellationBackground } from "@/components/ConstellationBackground";
import { HireLandingNav } from "@/components/landing/HireLandingNav";
import { RootHiringTeamSection } from "@/components/landing/RootHiringTeamSection";

/**
 * HireLanding — full standalone landing for hire.icareeros.com.
 *
 * Per COWORK-BRIEF-platform-subdomain-landings-v1 (2026-05-27): hire.* gets
 * its own landing surface (no longer 308-redirected to icareeros.com root
 * anchor). The For-Hiring-Teams content lives in RootHiringTeamSection —
 * already carries the approved copy verbatim (locked in PR #290).
 */
export function HireLanding() {
  return (
    <>
      <ConstellationBackground />
      <div style={{ position: "relative", zIndex: 1 }}>
        <HireLandingNav />
        <main>
          <RootHiringTeamSection />
        </main>
      </div>
    </>
  );
}
