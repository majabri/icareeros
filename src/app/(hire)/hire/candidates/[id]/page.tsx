import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { withCrossSubdomainCookie } from "@/lib/supabase-cookie-options";
import { isBlockedFor } from "@/lib/hire/blockedCompaniesFilter";
import { arr, num, str } from "@/lib/career-os/normalize";
import { InviteForm } from "./InviteForm";

/**
 * Phase 3 (2026-05-17) — Recruiter-facing candidate detail page.
 *
 * Server component. Gates:
 *   - 401 → redirect to /auth/login (middleware handles upstream too)
 *   - 403 → page-level Forbidden when user lacks the 'employer' role
 *   - 404 → notFound() when candidate not discoverable OR blocked by
 *           the recruiter's company OR no such career_profiles row
 *
 * Layout matches the hire shell — navy bg, slate cards, teal accent,
 * gold for the market-fit score. All array/string field reads pass
 * through the shared arr/str/num normalizers so partial DB shapes
 * don't crash the page.
 */

export const metadata: Metadata = { title: "Candidate — iCareerOS for Hiring" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function makeSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cs: Array<{ name: string; value: string; options: CookieOptions }>) {
          cs.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, withCrossSubdomainCookie(options)),
          );
        },
      },
    },
  );
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CandidateDetailPage({ params }: PageProps) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const supabase = await makeSupabaseServer();

  // 1) Auth + role gate.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return <ForbiddenLikeShell title="Sign in required" body="Please sign in as an employer to view candidates." />;
  }
  const { data: roleRows } = await supabase
    .from("user_roles").select("role").eq("user_id", user.id);
  const isEmployer = (roleRows ?? []).some((r) => (r as { role?: string }).role === "employer");
  if (!isEmployer) {
    return <ForbiddenLikeShell title="Recruiter access only" body="This page is only available to accounts with the recruiter role." />;
  }

  // 2) Server-trusted viewerCompany.
  const { data: emp } = await supabase
    .from("employer_profiles")
    .select("company_name")
    .eq("user_id", user.id)
    .maybeSingle();
  const viewerCompany = typeof emp?.company_name === "string"
    ? emp.company_name.trim() : "";

  // 3) Load candidate profile (RLS already enforces is_discoverable=true
  //    for employer accounts).
  const { data: cp } = await supabase
    .from("career_profiles")
    .select(
      "user_id, headline, summary, skills, target_skills, location, blocked_companies, is_discoverable",
    )
    .eq("user_id", id)
    .maybeSingle();
  if (!cp || cp.is_discoverable !== true) notFound();
  if (viewerCompany && isBlockedFor(cp as { blocked_companies?: unknown }, viewerCompany)) {
    notFound();
  }

  // 4) Join user_profiles (display fields).
  const { data: up } = await supabase
    .from("user_profiles")
    .select("user_id, full_name, current_position, target_roles, experience_level, open_to_remote, avatar_url, location")
    .eq("user_id", id)
    .maybeSingle();

  // 5) Pull latest stage notes for evaluate / advise / learn from the
  //    candidate's most-recent cycle. Used for market fit, gaps, paths.
  const { data: cycles } = await supabase
    .from("career_os_cycles")
    .select("id, created_at")
    .eq("user_id", id)
    .order("created_at", { ascending: false })
    .limit(1);
  let evaluateNotes: Record<string, unknown> = {};
  let adviseNotes:   Record<string, unknown> = {};
  let learnNotes:    Record<string, unknown> = {};
  const cycleId = cycles?.[0]?.id;
  if (cycleId) {
    const { data: stages } = await supabase
      .from("career_os_stages")
      .select("stage, notes")
      .eq("cycle_id", cycleId)
      .in("stage", ["evaluate", "advise", "learn"]);
    for (const row of stages ?? []) {
      const n = (row as { notes?: unknown }).notes;
      if (n && typeof n === "object") {
        const stage = (row as { stage?: string }).stage;
        if (stage === "evaluate") evaluateNotes = n as Record<string, unknown>;
        if (stage === "advise")   adviseNotes   = n as Record<string, unknown>;
        if (stage === "learn")    learnNotes    = n as Record<string, unknown>;
      }
    }
  }

  // 6) Check whether THIS recruiter has already pinged this candidate.
  const { data: priorInvite } = await supabase
    .from("recruiter_invites")
    .select("id")
    .eq("recruiter_user_id", user.id)
    .eq("candidate_user_id", id)
    .eq("status", "pending")
    .maybeSingle();
  const alreadyInvited = !!priorInvite?.id;

  // 7) Normalize all display fields.
  const safeUp = (up ?? {}) as Record<string, unknown>;
  const safeCp = cp as Record<string, unknown>;
  const fullName        = str(safeUp.full_name);
  const headline        = str(safeCp.headline);
  const summary         = str(safeCp.summary)        || str(evaluateNotes.summary);
  const location        = str(safeCp.location)       || str(safeUp.location);
  const experienceLevel = str(safeUp.experience_level);
  const openToRemote    = safeUp.open_to_remote === true;
  const currentPosition = str(safeUp.current_position);
  const skills          = arr<string>(safeCp.skills);
  const targetSkills    = arr<string>(safeCp.target_skills);
  const targetRoles     = arr<string>(safeUp.target_roles);
  const evalGaps        = arr<string>(evaluateNotes.gaps);
  const careerLevel     = str(evaluateNotes.careerLevel);
  const marketFitScore  = num(evaluateNotes.marketFitScore);
  const recommendedNext = str(evaluateNotes.recommendedNextStage);
  const adviseSummary   = str(adviseNotes.summary);
  const adviseTimeline  = num(adviseNotes.timelineWeeks);
  const adviseTopPaths  = arr<Record<string, unknown>>(adviseNotes.recommendedPaths).slice(0, 4);
  const learnTopGaps    = arr<string>(learnNotes.topSkillGaps);
  const learnWeeks      = num(learnNotes.estimatedCompletionWeeks);

  const displayName = fullName.trim() || "Anonymous";  // privacy fallback
  const role        = headline || currentPosition;
  const initials    = (fullName.trim() || headline || "?")
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => (w[0] ?? "").toUpperCase()).join("") || "?";

  return (
    <div style={{ padding: "2.5rem 1.5rem 6rem", color: "var(--text-primary, #E5EEFA)" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div style={{ marginBottom: "1rem" }}>
          <Link
            href="/select"
            style={{ color: "#A5B5CF", textDecoration: "none", fontSize: "0.9rem" }}
          >
            ← Back to search
          </Link>
        </div>

        {/* HEADER ───────────────────────────────────────────────── */}
        <section
          style={{
            background: "var(--surface-card, #1A2D45)",
            borderLeft: "3px solid #00B8A9",
            borderRadius: 14,
            padding: "1.75rem",
            marginBottom: "1.25rem",
            display: "grid",
            gridTemplateColumns: "auto 1fr auto",
            gap: "1.5rem",
            alignItems: "center",
          }}
        >
          {/* Avatar */}
          <div
            aria-hidden
            style={{
              width: 64, height: 64, borderRadius: "50%",
              background: "#7B9AC0", color: "#0F1B2D",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              fontWeight: 800, fontSize: "1.15rem",
            }}
          >
            {initials}
          </div>

          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text-primary, #E5EEFA)" }}>
              {displayName}
            </h1>
            {role && (
              <div style={{ color: "#A5B5CF", fontSize: "0.95rem", marginTop: "0.2rem" }}>
                {role}
              </div>
            )}
            <div style={{ marginTop: "0.7rem", display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
              {location && <BadgeChip>{location}</BadgeChip>}
              {openToRemote && <BadgeChip variant="teal">Remote OK</BadgeChip>}
              {experienceLevel && <BadgeChip>{experienceLevel}</BadgeChip>}
              {careerLevel && <BadgeChip variant="gold">{careerLevel}</BadgeChip>}
              {recommendedNext && <BadgeChip>Next: {recommendedNext}</BadgeChip>}
            </div>
          </div>

          {/* Market fit score */}
          {marketFitScore > 0 && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "2.25rem", fontWeight: 800, color: "#F5A623", lineHeight: 1 }}>
                {marketFitScore}
              </div>
              <div style={{ color: "var(--text-muted, #7B9AC0)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.5px", marginTop: "0.15rem" }}>
                market fit
              </div>
              <div style={{ marginTop: "0.4rem", height: 4, width: 80, borderRadius: 4, background: "rgba(123,154,192,0.25)", overflow: "hidden", margin: "0.4rem auto 0" }}>
                <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, marketFitScore))}%`, background: "#F5A623" }} />
              </div>
            </div>
          )}
        </section>

        {/* SKILLS ──────────────────────────────────────────────── */}
        <section
          style={{
            background: "var(--surface-card, #1A2D45)",
            borderRadius: 14,
            padding: "1.5rem",
            marginBottom: "1.25rem",
          }}
        >
          <SkillBlock label="Has these skills"        items={skills}        variant="teal"  />
          <SkillBlock label="Working toward"          items={targetSkills}  variant="slate" />
          <SkillBlock label="Skill gaps identified"   items={evalGaps}      variant="coral" />
        </section>

        {/* CAREER PATH ────────────────────────────────────────── */}
        <section
          style={{
            background: "var(--surface-card, #1A2D45)",
            borderRadius: 14,
            padding: "1.5rem",
            marginBottom: "1.25rem",
          }}
        >
          <h2 style={sectionHeadingStyle}>Career path</h2>

          {targetRoles.length > 0 && (
            <div style={{ marginBottom: "0.85rem" }}>
              <SubLabel>Target roles</SubLabel>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.35rem" }}>
                {targetRoles.map((r) => (
                  <span
                    key={r}
                    style={{
                      background: "rgba(245,166,35,0.12)",
                      color: "#F5C57A",
                      padding: "0.25rem 0.65rem",
                      borderRadius: 999,
                      fontWeight: 600,
                      fontSize: "0.8rem",
                    }}
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>
          )}

          {summary && (
            <div style={{ marginBottom: "0.85rem" }}>
              <SubLabel>Summary</SubLabel>
              <p style={{ marginTop: "0.35rem", color: "#A5B5CF", fontSize: "0.92rem", lineHeight: 1.6 }}>
                {summary}
              </p>
            </div>
          )}

          {adviseTopPaths.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <SubLabel>Top recommendations</SubLabel>
              <ul style={{ marginTop: "0.45rem", padding: 0, listStyle: "none", display: "grid", gap: "0.5rem" }}>
                {adviseTopPaths.map((p, i) => {
                  const path = p as Record<string, unknown>;
                  return (
                    <li
                      key={i}
                      style={{
                        background: "#142238",
                        border: "1px solid var(--surface-border, #243653)",
                        borderRadius: 10,
                        padding: "0.6rem 0.85rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "0.75rem",
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{str(path.title)}</span>
                      {typeof path.matchScore === "number" && (
                        <span style={{ color: "#F5A623", fontWeight: 700, fontSize: "0.85rem" }}>
                          {Math.round(num(path.matchScore))}% match
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              {adviseTimeline > 0 && (
                <p style={{ marginTop: "0.5rem", color: "var(--text-muted, #7B9AC0)", fontSize: "0.8rem" }}>
                  Path-to-target estimate: ~{adviseTimeline} weeks
                </p>
              )}
              {adviseSummary && (
                <p style={{ marginTop: "0.35rem", color: "#A5B5CF", fontSize: "0.85rem", lineHeight: 1.55 }}>
                  {adviseSummary}
                </p>
              )}
            </div>
          )}
        </section>

        {/* LEARNING ─────────────────────────────────────────────── */}
        {(learnWeeks > 0 || learnTopGaps.length > 0) && (
          <section
            style={{
              background: "var(--surface-card, #1A2D45)",
              borderRadius: 14,
              padding: "1.5rem",
              marginBottom: "1.25rem",
            }}
          >
            <h2 style={sectionHeadingStyle}>Learning plan</h2>
            {learnWeeks > 0 && (
              <p style={{ color: "#A5B5CF", fontSize: "0.92rem" }}>
                Estimated completion: <strong style={{ color: "#F5C57A" }}>~{learnWeeks} weeks</strong>
              </p>
            )}
            {learnTopGaps.length > 0 && (
              <div style={{ marginTop: "0.6rem" }}>
                <SubLabel>Addressing</SubLabel>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.35rem" }}>
                  {learnTopGaps.map((s) => (
                    <span
                      key={s}
                      style={{
                        background: "rgba(233,125,125,0.12)",
                        color: "#F4B3B3",
                        padding: "0.22rem 0.6rem",
                        borderRadius: 999,
                        fontWeight: 500,
                        fontSize: "0.78rem",
                      }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      {/* STICKY ACTION BAR ─────────────────────────────────────── */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          marginTop: "1.5rem",
          background: "rgba(11,20,34,0.94)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          borderTop: "1px solid var(--surface-border, #243653)",
          padding: "0.85rem 1.5rem",
        }}
      >
        <div
          style={{
            maxWidth: 960,
            margin: "0 auto",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <Link
            href="/select"
            style={{
              color: "#A5B5CF",
              textDecoration: "underline",
              fontSize: "0.9rem",
              paddingTop: "0.7rem",
            }}
          >
            ← Back to search
          </Link>
          <InviteForm
            candidateUserId={id}
            initialAlreadyInvited={alreadyInvited}
          />
        </div>
      </div>
    </div>
  );
}

// ── Small server-only sub-components ────────────────────────────

function ForbiddenLikeShell({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ padding: "5rem 1.5rem", color: "var(--text-primary, #E5EEFA)", textAlign: "center" }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <div aria-hidden style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>🔒</div>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 800, marginBottom: "0.5rem" }}>{title}</h1>
        <p style={{ color: "#A5B5CF", fontSize: "0.95rem", lineHeight: 1.6 }}>{body}</p>
        <Link href="/select" style={{ display: "inline-block", marginTop: "1.5rem", color: "#7BD6C9", textDecoration: "underline" }}>
          Back to search
        </Link>
      </div>
    </div>
  );
}

const sectionHeadingStyle: React.CSSProperties = {
  fontSize: "0.7rem",
  textTransform: "uppercase",
  letterSpacing: "0.6px",
  color: "var(--text-muted, #7B9AC0)",
  fontWeight: 700,
  marginBottom: "0.75rem",
};

function BadgeChip({ children, variant }: { children: React.ReactNode; variant?: "teal" | "gold" }) {
  const styles: Record<string, React.CSSProperties> = {
    default: { background: "rgba(123,154,192,0.16)", color: "#A5B5CF" },
    teal:    { background: "rgba(0,184,169,0.16)",  color: "#7BD6C9" },
    gold:    { background: "rgba(245,166,35,0.16)",  color: "#F5C57A" },
  };
  const style = styles[variant ?? "default"];
  return (
    <span
      style={{
        ...style,
        fontSize: "0.78rem",
        fontWeight: 600,
        padding: "0.22rem 0.65rem",
        borderRadius: 999,
      }}
    >
      {children}
    </span>
  );
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      color: "var(--text-muted, #7B9AC0)",
      fontSize: "0.7rem",
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      fontWeight: 700,
    }}>
      {children}
    </span>
  );
}

function SkillBlock({
  label, items, variant,
}: {
  label:   string;
  items:   string[];
  variant: "teal" | "slate" | "coral";
}) {
  if (items.length === 0) return null;
  const styles: Record<string, React.CSSProperties> = {
    teal:  { background: "rgba(0,184,169,0.14)",  color: "#7BD6C9" },
    slate: { background: "rgba(123,154,192,0.16)", color: "#A5B5CF" },
    coral: { background: "rgba(233,125,125,0.14)", color: "#F4B3B3" },
  };
  return (
    <div style={{ marginBottom: "0.85rem" }}>
      <SubLabel>{label}</SubLabel>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.35rem" }}>
        {items.map((s) => (
          <span
            key={s}
            style={{
              ...styles[variant],
              fontSize: "0.8rem",
              fontWeight: 500,
              padding: "0.22rem 0.65rem",
              borderRadius: 999,
            }}
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}
