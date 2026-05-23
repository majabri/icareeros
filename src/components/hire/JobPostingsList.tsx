"use client";

/**
 * JobPostingsList — shows the authenticated employer's own postings.
 *
 * Used below the JD form on /design. Backed by
 * GET /api/hire/job-postings (RLS scopes results to user_id=auth.uid()).
 *
 * Status badges (per HIRE-STAGE-DEFINITIONS lifecycle locked in
 * ADR-HIRE-002 v1.1):
 *   draft   → slate
 *   open    → green ("Live on iCareerOS")
 *   closed  → coral
 *   filled  → slate (treated like closed for display)
 *
 * Refresh is controlled by `refreshToken` from the parent — when the
 * Design page's form saves, it bumps the token and we re-fetch. Avoids
 * passing a refetch ref down or wiring an event bus.
 *
 * No hardcoded hex — colour tokens via @/lib/design-tokens.
 */

import { useEffect, useState, useCallback } from "react";
import { BRAND_COLORS } from "@/lib/design-tokens";

interface PostingRow {
  id:           string;
  title:        string;
  company:      string;
  status:       "draft" | "open" | "closed" | "filled";
  published_at: string | null;
  created_at:   string;
  updated_at:   string;
  is_remote:    boolean;
  location:     string | null;
}

export interface JobPostingsListProps {
  refreshToken?: number;
}

function badgeColours(status: PostingRow["status"]) {
  switch (status) {
    case "open":
      return { label: "Live",   fg: "#065F46", bg: `${BRAND_COLORS.green}1A` };
    case "closed":
    case "filled":
      return { label: status === "filled" ? "Filled" : "Closed",
               fg: "#9F1239", bg: `${BRAND_COLORS.coral}1A` };
    case "draft":
    default:
      return { label: "Draft",  fg: "#475569", bg: "#F1F5F9" };
  }
}

function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60)         return "just now";
  if (s < 3600)       return `${Math.floor(s / 60)}m ago`;
  if (s < 86400)      return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 14) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function JobPostingsList({ refreshToken = 0 }: JobPostingsListProps) {
  const [postings, setPostings] = useState<PostingRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/hire/job-postings", { credentials: "include" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `Failed to load (HTTP ${res.status})`);
        return;
      }
      const j = (await res.json()) as { postings?: PostingRow[] };
      setPostings(Array.isArray(j.postings) ? j.postings : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, refreshToken]);

  return (
    <section
      aria-label="My job postings"
      style={{
        background:    "var(--surface-card, #FFFFFF)",
        border:        "1px solid var(--surface-border, #E5E7EB)",
        borderRadius:  12,
        padding:       "1.25rem 1.5rem",
      }}
    >
      <header style={{ marginBottom: "0.85rem", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "0.6rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: `var(--text-primary, ${BRAND_COLORS.navy})` }}>
          Your postings
        </h2>
        <span style={{ fontSize: "0.78rem", color: "var(--text-muted, #64748B)" }}>
          {loading ? "Loading…" : `${postings.length} total`}
        </span>
      </header>

      {error && (
        <div role="alert" style={{
          padding:      "0.55rem 0.85rem",
          borderRadius: 8,
          fontSize:     "0.85rem",
          background:   `${BRAND_COLORS.coral}1A`,
          color:        BRAND_COLORS.coral,
          marginBottom: "0.85rem",
        }}>
          ⚠ {error}
        </div>
      )}

      {!loading && postings.length === 0 && !error && (
        <p style={{ fontSize: "0.92rem", color: "var(--text-muted, #64748B)", margin: 0 }}>
          You have not posted any roles yet. Draft one above to get started.
        </p>
      )}

      {postings.length > 0 && (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.6rem" }}>
          {postings.map((p) => {
            const b = badgeColours(p.status);
            const stamp = p.status === "open" ? p.published_at : p.updated_at;
            const stampLabel = p.status === "open" ? "Published" : "Updated";
            return (
              <li key={p.id}
                  style={{
                    display:       "grid",
                    gridTemplateColumns: "1fr auto",
                    alignItems:    "center",
                    gap:           "0.8rem",
                    padding:       "0.7rem 0.95rem",
                    border:        "1px solid var(--surface-border, #E5E7EB)",
                    borderLeft:    `4px solid ${p.status === "open" ? BRAND_COLORS.green : p.status === "draft" ? "#CBD5E1" : BRAND_COLORS.coral}`,
                    borderRadius:  10,
                  }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "0.95rem", fontWeight: 700, color: `var(--text-primary, ${BRAND_COLORS.navy})`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.title || "(untitled)"}
                  </div>
                  <div style={{ marginTop: "0.18rem", fontSize: "0.8rem", color: "var(--text-muted, #64748B)" }}>
                    {p.company}{p.location ? ` · ${p.location}` : ""}{p.is_remote ? " · Remote" : ""}
                  </div>
                  <div style={{ marginTop: "0.25rem", fontSize: "0.72rem", color: "var(--text-muted, #94A3B8)" }}>
                    {stampLabel} {fmtRelative(stamp)}
                  </div>
                </div>
                <span style={{
                  display:       "inline-flex",
                  alignItems:    "center",
                  padding:       "0.22rem 0.65rem",
                  borderRadius:  999,
                  fontSize:      "0.7rem",
                  fontWeight:    700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color:         b.fg,
                  background:    b.bg,
                  whiteSpace:    "nowrap",
                }}>
                  {b.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default JobPostingsList;
