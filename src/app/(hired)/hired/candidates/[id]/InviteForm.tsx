"use client";

/**
 * Phase 3 (2026-05-17) — Inline outreach form on the candidate detail
 * page. No modal: expands below the action bar.
 *
 *   - Idle state            → "Send invite →" button
 *   - Expanded state        → job title + optional message + send/cancel
 *   - Submitting state      → button reads "Sending…", disabled
 *   - Success state         → "Invite sent ✓" emerald, disabled
 *   - Already-invited state → "Already invited" amber, disabled
 */

import { useState } from "react";

interface InviteFormProps {
  candidateUserId: string;
  /** Set to true when the server has already recorded a pending invite
   *  for this recruiter+candidate pair on initial page load. */
  initialAlreadyInvited?: boolean;
}

type Phase = "idle" | "expanded" | "sending" | "sent" | "already";

export function InviteForm({ candidateUserId, initialAlreadyInvited }: InviteFormProps) {
  const [phase, setPhase]    = useState<Phase>(initialAlreadyInvited ? "already" : "idle");
  const [error, setError]    = useState<string | null>(null);
  const [jobTitle, setJobTitle] = useState("");
  const [message,  setMessage]  = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPhase("sending");
    try {
      const res = await fetch("/api/hired/invite", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body:    JSON.stringify({
          candidateUserId,
          jobTitle,
          message,
        }),
      });
      if (res.status === 409) {
        setPhase("already");
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `Send failed (${res.status})`);
        setPhase("expanded");
        return;
      }
      setPhase("sent");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setPhase("expanded");
    }
  }

  // Disabled affordances for the action bar:
  if (phase === "sent") {
    return (
      <span
        role="status"
        style={{
          background: "rgba(0,184,169,0.18)",
          color: "#7BD6C9",
          padding: "0.6rem 1.25rem",
          borderRadius: 10,
          fontWeight: 700,
          fontSize: "0.95rem",
          display: "inline-flex",
          alignItems: "center",
          gap: "0.4rem",
        }}
      >
        Invite sent ✓
      </span>
    );
  }
  if (phase === "already") {
    return (
      <span
        role="status"
        style={{
          background: "rgba(245,166,35,0.18)",
          color: "#F5C57A",
          padding: "0.6rem 1.25rem",
          borderRadius: 10,
          fontWeight: 700,
          fontSize: "0.95rem",
        }}
      >
        Already invited
      </span>
    );
  }

  if (phase === "idle") {
    return (
      <button
        type="button"
        onClick={() => setPhase("expanded")}
        style={{
          background: "#00B8A9",
          color: "#0B1422",
          padding: "0.65rem 1.4rem",
          borderRadius: 10,
          border: "none",
          fontWeight: 700,
          fontSize: "0.95rem",
          cursor: "pointer",
        }}
      >
        Send invite →
      </button>
    );
  }

  // Expanded or sending.
  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: "grid",
        gap: "0.75rem",
        width: "100%",
        maxWidth: 520,
      }}
    >
      <label style={{ display: "block" }}>
        <span
          style={{
            color: "#7B9AC0",
            fontSize: "0.7rem",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            fontWeight: 600,
          }}
        >
          Job title <span style={{ color: "#F5A623" }}>*</span>
        </span>
        <input
          type="text"
          value={jobTitle}
          required
          maxLength={200}
          onChange={(e) => setJobTitle(e.target.value)}
          placeholder="e.g. Senior Product Manager"
          style={{
            marginTop: "0.25rem",
            width: "100%",
            background: "#142238",
            border: "1px solid #243653",
            borderRadius: 10,
            padding: "0.55rem 0.85rem",
            color: "#E5EEFA",
            fontSize: "0.95rem",
            outline: "none",
          }}
        />
      </label>

      <label style={{ display: "block" }}>
        <span
          style={{
            color: "#7B9AC0",
            fontSize: "0.7rem",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            fontWeight: 600,
          }}
        >
          Message (optional, max 500 chars)
        </span>
        <textarea
          value={message}
          maxLength={500}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder="Briefly tell them what role you have in mind…"
          style={{
            marginTop: "0.25rem",
            width: "100%",
            background: "#142238",
            border: "1px solid #243653",
            borderRadius: 10,
            padding: "0.55rem 0.85rem",
            color: "#E5EEFA",
            fontSize: "0.92rem",
            resize: "vertical",
            outline: "none",
          }}
        />
        <span style={{ color: "#7B9AC0", fontSize: "0.7rem", marginTop: "0.2rem", display: "block" }}>
          {message.length}/500
        </span>
      </label>

      {error && (
        <p role="alert" style={{ color: "#FCC", fontSize: "0.85rem" }}>⚠ {error}</p>
      )}

      <div style={{ display: "flex", gap: "0.65rem", alignItems: "center" }}>
        <button
          type="submit"
          disabled={phase === "sending" || !jobTitle.trim()}
          style={{
            background: "#00B8A9",
            color: "#0B1422",
            padding: "0.6rem 1.4rem",
            borderRadius: 10,
            border: "none",
            fontWeight: 700,
            fontSize: "0.95rem",
            cursor: phase === "sending" ? "wait" : "pointer",
            opacity: phase === "sending" || !jobTitle.trim() ? 0.6 : 1,
          }}
        >
          {phase === "sending" ? "Sending…" : "Send invite"}
        </button>
        <button
          type="button"
          onClick={() => {
            setPhase("idle");
            setJobTitle("");
            setMessage("");
            setError(null);
          }}
          disabled={phase === "sending"}
          style={{
            background: "transparent",
            color: "#A5B5CF",
            padding: "0.6rem 1rem",
            borderRadius: 10,
            border: "1px solid #243653",
            fontWeight: 600,
            fontSize: "0.9rem",
            cursor: phase === "sending" ? "wait" : "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
