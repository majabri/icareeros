"use client";

/**
 * Phase 2 recruiter discoverability (2026-05-17) — Candidate search UI
 * on hire.icareeros.com/dashboard.
 *
 * Layout:
 *   Hero     — title, subtitle, prominent search bar
 *   Filters  — Skills · Target role · Location · Experience · Remote
 *   Grid     — 2-col card list (1-col mobile)
 *   Empty    — "no discoverable candidates yet" + JD analyser link
 *
 * Visual system (per the brief — distinct from jobs.):
 *   Background : navy   #0F1B2D (set on (hire) layout)
 *   Card       : slate  #1A2D45
 *   Accent     : teal   #00B8A9
 *   Premium    : gold   #F5A623   (used for score)
 *   Data label : slate  #7B9AC0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

interface Candidate {
  user_id:          string;
  headline:         string | null;
  summary:          string | null;
  skills:           string[];
  location:         string | null;
  full_name:        string | null;
  avatar_url:       string | null;
  target_roles:     string[];
  experience_level: string | null;
  open_to_remote:   boolean;
  current_position: string | null;
}

interface SearchResponse {
  candidates: Candidate[];
  total:      number;
  page:       number;
  pageSize:   number;
}

const PLACEHOLDERS = [
  "Search by skills, role, or location…",
  "e.g. Senior product manager, remote, US",
  "Try: React, TypeScript, fintech",
  "Try: data scientist, NYC, 5+ years",
];

export function CandidateSearch() {
  // Search inputs
  const [query,           setQuery]           = useState("");
  const [targetRole,      setTargetRole]      = useState("");
  const [location,        setLocation]        = useState("");
  const [remote,          setRemote]          = useState(false);
  const [experienceLevel, setExperienceLevel] = useState("");

  // Results
  const [candidates,        setCandidates]        = useState<Candidate[]>([]);
  const [total,             setTotal]             = useState(0);
  const [loading,           setLoading]           = useState(false);
  const [error,             setError]             = useState<string | null>(null);
  // Phase 3 — server returns 422 + profileIncomplete:true until the
  // recruiter fills in their company profile at /hire/profile.
  const [profileIncomplete, setProfileIncomplete] = useState(false);

  // Cycling placeholder
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % PLACEHOLDERS.length);
    }, 4000);
    return () => clearInterval(t);
  }, []);

  // Debounced search.
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Parse the freeform query into "skills any-of words" heuristically.
      const skillsFromQuery = query
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      const res = await fetch("/api/hire/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          skills:          skillsFromQuery,
          targetRole:      targetRole || undefined,
          location:        location   || undefined,
          remote:          remote,
          experienceLevel: experienceLevel || undefined,
        }),
      });
      if (res.status === 422) {
        const j = await res.json().catch(() => ({}));
        if (j?.profileIncomplete) {
          setProfileIncomplete(true);
          setCandidates([]);
          setTotal(0);
          return;
        }
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Search failed (${res.status})`);
      }
      setProfileIncomplete(false);
      const json = (await res.json()) as SearchResponse;
      setCandidates(json.candidates ?? []);
      setTotal(json.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
      setCandidates([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [query, targetRole, location, remote, experienceLevel]);

  // Apply filters with 300ms debounce.
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      void runSearch();
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [runSearch]);

  // Initial load.
  useEffect(() => {
    void runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ minHeight: "calc(100vh - 73px)", padding: "3rem 1.5rem 5rem" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        {/* Hero */}
        <header style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <h1 style={{ color: "#E5EEFA", fontSize: "2.25rem", fontWeight: 800, letterSpacing: "-0.5px" }}>
            Find exceptional talent
          </h1>
          <p style={{ color: "#A5B5CF", fontSize: "1rem", marginTop: "0.75rem", maxWidth: 640, marginInline: "auto" }}>
            AI-assessed candidates who are actively looking and match your
            exact requirements.
          </p>
        </header>

        {/* Phase 3 — Complete-your-profile gate banner. */}
        {profileIncomplete && (
          <div
            role="alert"
            style={{
              background: "rgba(245,166,35,0.08)",
              border: "1px solid rgba(245,166,35,0.35)",
              borderRadius: 12,
              padding: "1rem 1.25rem",
              marginBottom: "1.5rem",
              display: "flex",
              alignItems: "center",
              gap: "1rem",
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: "1.5rem" }} aria-hidden>🏢</div>
            <div style={{ flex: 1, minWidth: "200px" }}>
              <div style={{ color: "#F5A623", fontWeight: 700, fontSize: "0.95rem" }}>
                Complete your company profile to enable candidate search.
              </div>
              <p style={{ color: "#A5B5CF", fontSize: "0.85rem", marginTop: "0.25rem", lineHeight: 1.5 }}>
                We need your company name to honour job-seeker block lists.
                Candidates who&apos;ve blocked your company won&apos;t show up
                in your searches.
              </p>
            </div>
            <Link
              href="/profile"
              style={{
                background: "#00B8A9",
                color: "#0B1422",
                padding: "0.5rem 1.1rem",
                borderRadius: 10,
                fontWeight: 700,
                textDecoration: "none",
                fontSize: "0.9rem",
                whiteSpace: "nowrap",
              }}
            >
              Set up profile →
            </Link>
          </div>
        )}

        {/* Search bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch();
          }}
          style={{ marginBottom: "1.5rem" }}
        >
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              alignItems: "stretch",
              background: "#142238",
              border: "1px solid #243653",
              borderRadius: 14,
              padding: "0.35rem 0.35rem 0.35rem 1rem",
            }}
          >
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={PLACEHOLDERS[placeholderIdx]}
              aria-label="Search candidates"
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "#E5EEFA",
                fontSize: "1rem",
                padding: "0.5rem 0",
              }}
            />
            <button
              type="submit"
              style={{
                background: "#00B8A9",
                color: "#0B1422",
                fontWeight: 700,
                padding: "0.5rem 1.5rem",
                borderRadius: 10,
                border: "none",
                cursor: "pointer",
                fontSize: "0.95rem",
              }}
            >
              Search →
            </button>
          </div>
        </form>

        {/* Filter row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "0.75rem",
            marginBottom: "2rem",
          }}
        >
          <FilterInput
            label="Target role"
            value={targetRole}
            onChange={setTargetRole}
            placeholder="e.g. Senior PM"
          />
          <FilterInput
            label="Location"
            value={location}
            onChange={setLocation}
            placeholder="e.g. NYC, remote"
          />
          <FilterSelect
            label="Experience"
            value={experienceLevel}
            onChange={setExperienceLevel}
            options={["", "Entry", "Mid", "Senior", "Lead", "Executive"]}
          />
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              background: "#142238",
              border: "1px solid #243653",
              borderRadius: 10,
              padding: "0.6rem 0.9rem",
              color: "#E5EEFA",
              fontSize: "0.9rem",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={remote}
              onChange={(e) => setRemote(e.target.checked)}
              style={{ accentColor: "#00B8A9" }}
            />
            Open to remote
          </label>
        </div>

        {/* Results summary */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", color: "#7B9AC0", fontSize: "0.85rem", marginBottom: "1rem" }}>
          <span>
            {loading ? "Searching…" : `${total} candidate${total === 1 ? "" : "s"}`}
          </span>
          {error && <span style={{ color: "#E97D7D" }}>⚠ {error}</span>}
        </div>

        {/* Grid */}
        {!loading && candidates.length === 0 ? (
          <EmptyState />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
              gap: "1rem",
            }}
          >
            {candidates.map((c) => (
              <CandidateCard key={c.user_id} candidate={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Filter components ────────────────────────────────────────────────

function FilterInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label:        string;
  value:        string;
  onChange:     (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ color: "#7B9AC0", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          marginTop: "0.25rem",
          width: "100%",
          background: "#142238",
          border: "1px solid #243653",
          borderRadius: 10,
          padding: "0.5rem 0.75rem",
          color: "#E5EEFA",
          fontSize: "0.9rem",
          outline: "none",
        }}
      />
    </label>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label:    string;
  value:    string;
  onChange: (v: string) => void;
  options:  string[];
}) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ color: "#7B9AC0", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          marginTop: "0.25rem",
          width: "100%",
          background: "#142238",
          border: "1px solid #243653",
          borderRadius: 10,
          padding: "0.5rem 0.75rem",
          color: "#E5EEFA",
          fontSize: "0.9rem",
          outline: "none",
          cursor: "pointer",
        }}
      >
        {options.map((opt) => (
          <option key={opt} value={opt} style={{ background: "#142238" }}>
            {opt || "Any"}
          </option>
        ))}
      </select>
    </label>
  );
}

// ── Candidate card ──────────────────────────────────────────────────

function CandidateCard({ candidate }: { candidate: Candidate }) {
  const c = candidate;
  const fallbackInitials = (() => {
    const src = c.full_name ?? c.headline ?? "?";
    return src
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?";
  })();

  // Display preference: full_name OR headline OR position.
  const displayName = c.full_name?.trim() || null;
  const role        = c.headline?.trim() || c.current_position?.trim() || null;
  const skills      = c.skills.slice(0, 5);
  const target      = c.target_roles[0] ?? null;
  const openTo: string[] = [];
  if (c.open_to_remote) openTo.push("Remote");
  if (c.location)       openTo.push(c.location);

  return (
    <article
      style={{
        background: "#1A2D45",
        borderLeft: "3px solid #00B8A9",
        borderRadius: 12,
        padding: "1.25rem 1.5rem",
        color: "#E5EEFA",
        boxShadow: "0 4px 18px rgba(0,0,0,0.18)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
        <div
          aria-hidden
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "#7B9AC0",
            color: "#0F1B2D",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: "0.85rem",
            flexShrink: 0,
          }}
        >
          {fallbackInitials}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: "1rem", color: "#E5EEFA", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {displayName ?? role ?? "iCareerOS candidate"}
          </div>
          {role && displayName && (
            <div style={{ color: "#A5B5CF", fontSize: "0.85rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {role}
            </div>
          )}
        </div>
      </div>

      {openTo.length > 0 && (
        <div style={{ marginBottom: "0.5rem", fontSize: "0.85rem", color: "#A5B5CF" }}>
          <span style={{ color: "#7B9AC0", fontWeight: 600 }}>Open to:</span> {openTo.join(" · ")}
          {c.experience_level && <> · {c.experience_level}</>}
        </div>
      )}

      {skills.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.75rem" }}>
          {skills.map((s) => (
            <span
              key={s}
              style={{
                background: "rgba(0,184,169,0.15)",
                color: "#7BD6C9",
                fontSize: "0.75rem",
                padding: "0.2rem 0.55rem",
                borderRadius: 999,
                fontWeight: 500,
              }}
            >
              {s}
            </span>
          ))}
        </div>
      )}

      {target && (
        <div style={{ fontSize: "0.85rem", color: "#A5B5CF", marginBottom: "0.85rem" }}>
          <span style={{ color: "#7B9AC0", fontWeight: 600 }}>Target:</span>{" "}
          <span style={{ color: "#F5A623", fontWeight: 600 }}>{target}</span>
        </div>
      )}

      <Link
        href={`/candidates/${c.user_id}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.3rem",
          fontSize: "0.85rem",
          color: "#7BD6C9",
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        View profile →
      </Link>
    </article>
  );
}

// ── Empty state ─────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      style={{
        background: "#142238",
        border: "1px dashed #243653",
        borderRadius: 14,
        padding: "3.5rem 1.5rem",
        textAlign: "center",
      }}
    >
      <div aria-hidden style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>🔍</div>
      <h2 style={{ color: "#E5EEFA", fontSize: "1.15rem", fontWeight: 700, marginBottom: "0.5rem" }}>
        No candidates match your search yet.
      </h2>
      <p style={{ color: "#A5B5CF", fontSize: "0.95rem", lineHeight: 1.6, maxWidth: 480, margin: "0 auto 1.5rem" }}>
        iCareerOS candidates opt in to be discoverable. As more job seekers
        join and enable discoverability, they&apos;ll appear here.
      </p>
      <Link
        href="/recruiter"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.4rem",
          background: "#00B8A9",
          color: "#0B1422",
          fontWeight: 700,
          padding: "0.6rem 1.25rem",
          borderRadius: 10,
          textDecoration: "none",
        }}
      >
        Analyse a job description →
      </Link>
    </div>
  );
}
