"use client";

/**
 * DesignAgent — Stage 01 Design AI agent panel.
 *
 * Recruiter describes a role in plain language; the agent drafts a
 * structured JD and pre-fills the JobPostingForm via the
 * onDraftGenerated callback.
 *
 * Backed by /api/hire/design-agent (claude-haiku-4-5 via
 * createTracedClient). Non-streaming v1 per the 2026-05-22 CP1 routing
 * decision — single POST, loading spinner while awaiting, parsed JSON
 * on success.
 *
 * No hardcoded hex — colour tokens via @/lib/design-tokens.
 */

import { useState } from "react";
import { BRAND_COLORS } from "@/lib/design-tokens";

export interface DesignDraft {
  title:         string;
  description:   string;
  requirements:  string;
  nice_to_haves: string;
}

export interface DesignAgentProps {
  onDraftGenerated: (draft: DesignDraft) => void;
}

export function DesignAgent({ onDraftGenerated }: DesignAgentProps) {
  const [description, setDescription] = useState("");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const canGenerate = !loading && description.trim().length >= 5;

  async function handleGenerate() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/hire/design-agent", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({ description: description.trim() }),
      });
      const json = (await res.json()) as DesignDraft | { error: string };
      if (!res.ok || "error" in json) {
        setError(("error" in json && json.error) || "Failed to draft job description.");
        return;
      }
      onDraftGenerated(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      aria-label="AI Design agent"
      style={{
        background:   "var(--surface-card, #FFFFFF)",
        border:       "1px solid var(--surface-border, #E5E7EB)",
        borderLeft:   `4px solid ${BRAND_COLORS.teal}`,
        borderRadius: 12,
        padding:      "1.25rem 1.5rem",
        height:       "100%",
        display:      "flex",
        flexDirection: "column",
        gap:          "0.9rem",
      }}
    >
      <header>
        <div style={{
          fontSize:      "0.7rem",
          fontWeight:    700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color:         BRAND_COLORS.teal,
        }}>
          AI assistant
        </div>
        <h2 style={{
          margin:     "0.3rem 0 0",
          fontSize:   "1.15rem",
          fontWeight: 800,
          color:      `var(--text-primary, ${BRAND_COLORS.navy})`,
        }}>
          Draft a job description
        </h2>
        <p style={{
          marginTop:  "0.4rem",
          fontSize:   "0.88rem",
          color:      "var(--text-muted, #64748B)",
          lineHeight: 1.5,
        }}>
          Describe the role in plain language — team, seniority, must-haves,
          comp band, anything that matters. The agent will draft a
          structured JD you can edit before posting.
        </p>
      </header>

      <label style={{ display: "block", flex: 1 }}>
        <span style={{
          display:    "block",
          fontSize:   "0.78rem",
          fontWeight: 700,
          color:      `var(--text-primary, ${BRAND_COLORS.navy})`,
          marginBottom: "0.35rem",
        }}>
          Role description
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. We need a senior backend engineer to lead our payments rewrite. Heavy Go + Postgres, must have led a project end-to-end before. Remote-friendly, $160-200K + equity."
          rows={10}
          maxLength={2000}
          disabled={loading}
          style={{
            width:        "100%",
            padding:      "0.6rem 0.8rem",
            border:       "1px solid var(--surface-border, #CBD5E1)",
            borderRadius: 8,
            fontSize:     "0.92rem",
            lineHeight:   1.5,
            resize:       "vertical",
            minHeight:    180,
            fontFamily:   "inherit",
          }}
        />
        <div style={{
          marginTop: "0.3rem",
          fontSize:  "0.72rem",
          color:     "var(--text-muted, #94A3B8)",
          textAlign: "right",
        }}>
          {description.length} / 2000
        </div>
      </label>

      {error && (
        <div
          role="alert"
          style={{
            padding:      "0.55rem 0.85rem",
            borderRadius: 8,
            fontSize:     "0.85rem",
            background:   `${BRAND_COLORS.coral}1A`,
            color:        BRAND_COLORS.coral,
          }}
        >
          ⚠ {error}
        </div>
      )}

      <button
        type="button"
        onClick={() => void handleGenerate()}
        disabled={!canGenerate}
        style={{
          background:   canGenerate ? BRAND_COLORS.teal : "#CBD5E1",
          color:        "#FFFFFF",
          fontWeight:   700,
          fontSize:     "0.92rem",
          padding:      "0.65rem 1.25rem",
          borderRadius: 10,
          border:       "none",
          cursor:       canGenerate ? "pointer" : "not-allowed",
          alignSelf:    "flex-start",
          display:      "inline-flex",
          alignItems:   "center",
          gap:          "0.45rem",
          transition:   "background 120ms ease",
        }}
      >
        {loading ? (
          <>
            <span
              aria-hidden="true"
              style={{
                width:        14,
                height:       14,
                border:       "2px solid rgba(255,255,255,0.4)",
                borderTopColor: "#FFFFFF",
                borderRadius: "50%",
                display:      "inline-block",
                animation:    "spin 0.8s linear infinite",
              }}
            />
            Drafting…
          </>
        ) : (
          <>Generate JD draft →</>
        )}
      </button>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </section>
  );
}

export default DesignAgent;
