"use client";

/**
 * Phase 3 (2026-05-17) — Employer company profile setup.
 *
 * The candidate search API now refuses to return results until the
 * employer has filled in their company name (server-derives
 * viewerCompany from this row so block lists can't be bypassed).
 *
 * Visual system matches the (hired) shell — dark navy background, slate
 * #1A2D45 card surface, teal #00B8A9 primary, gold #F5A623 accent.
 */

import { useEffect, useState } from "react";
import Link from "next/link";

const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-1000", "1000+"] as const;

export default function EmployerProfilePage() {
  const [loading, setLoading]     = useState(true);
  const [saving,  setSaving]      = useState(false);
  const [error,   setError]       = useState<string | null>(null);
  const [savedAt, setSavedAt]     = useState<number | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [industry,    setIndustry]    = useState("");
  const [companySize, setCompanySize] = useState("");
  const [website,     setWebsite]     = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/hired/employer-profile", { credentials: "include" });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? "Failed to load profile.");
        } else if (json.hasProfile && json.profile) {
          setCompanyName(json.profile.company_name ?? "");
          setIndustry(json.profile.industry ?? "");
          setCompanySize(json.profile.company_size ?? "");
          setWebsite(json.profile.website ?? "");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/hired/employer-profile", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body:    JSON.stringify({
          company_name: companyName,
          industry,
          company_size: companySize,
          website,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Save failed.");
        return;
      }
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: "3rem 1.5rem", color: "#E5EEFA" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <header style={{ marginBottom: "2rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, marginBottom: "0.5rem" }}>
            Your company profile
          </h1>
          <p style={{ color: "#A5B5CF", fontSize: "0.95rem", lineHeight: 1.6 }}>
            We use this to enforce job-seeker block lists honestly. Candidates
            who&apos;ve blocked your company won&apos;t show up in your searches.
          </p>
        </header>

        {error && (
          <div
            role="alert"
            style={{
              background: "rgba(233,125,125,0.10)",
              border: "1px solid rgba(233,125,125,0.35)",
              color: "#FCC",
              borderRadius: 10,
              padding: "0.75rem 1rem",
              marginBottom: "1rem",
              fontSize: "0.9rem",
            }}
          >
            ⚠ {error}
          </div>
        )}

        {savedAt && (
          <div
            role="status"
            style={{
              background: "rgba(0,184,169,0.12)",
              border: "1px solid rgba(0,184,169,0.4)",
              color: "#7BD6C9",
              borderRadius: 10,
              padding: "0.6rem 1rem",
              marginBottom: "1rem",
              fontSize: "0.9rem",
            }}
          >
            Saved ✓
          </div>
        )}

        <form
          onSubmit={handleSave}
          style={{
            background: "#1A2D45",
            border: "1px solid #243653",
            borderRadius: 14,
            padding: "1.75rem",
            display: "grid",
            gap: "1.25rem",
          }}
        >
          <FormField label="Company name" required>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
              disabled={loading}
              placeholder="e.g. Acme Corp"
              style={fieldStyle}
            />
          </FormField>

          <FormField label="Industry">
            <input
              type="text"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              disabled={loading}
              placeholder="e.g. SaaS, Fintech, Healthcare"
              style={fieldStyle}
            />
          </FormField>

          <FormField label="Company size">
            <select
              value={companySize}
              onChange={(e) => setCompanySize(e.target.value)}
              disabled={loading}
              style={fieldStyle}
            >
              <option value="" style={{ background: "#142238" }}>Select size…</option>
              {COMPANY_SIZES.map((s) => (
                <option key={s} value={s} style={{ background: "#142238" }}>
                  {s}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Website">
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              disabled={loading}
              placeholder="https://example.com"
              style={fieldStyle}
            />
          </FormField>

          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <button
              type="submit"
              disabled={saving || loading || !companyName.trim()}
              style={{
                background: "#00B8A9",
                color: "#0B1422",
                padding: "0.6rem 1.5rem",
                borderRadius: 10,
                border: "none",
                fontWeight: 700,
                cursor: saving || loading || !companyName.trim() ? "not-allowed" : "pointer",
                fontSize: "0.95rem",
                opacity: saving || loading || !companyName.trim() ? 0.6 : 1,
              }}
            >
              {saving ? "Saving…" : "Save company profile"}
            </button>
            <Link
              href="/hired/dashboard"
              style={{ color: "#A5B5CF", textDecoration: "underline", fontSize: "0.85rem" }}
            >
              Back to search
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

const fieldStyle: React.CSSProperties = {
  width: "100%",
  background: "#142238",
  border: "1px solid #243653",
  borderRadius: 10,
  padding: "0.55rem 0.85rem",
  color: "#E5EEFA",
  fontSize: "0.95rem",
  outline: "none",
};

function FormField({
  label,
  required,
  children,
}: {
  label:     string;
  required?: boolean;
  children:  React.ReactNode;
}) {
  return (
    <label style={{ display: "block" }}>
      <span
        style={{
          color: "#7B9AC0",
          fontSize: "0.72rem",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          fontWeight: 600,
          display: "block",
          marginBottom: "0.3rem",
        }}
      >
        {label}
        {required && <span style={{ color: "#F5A623", marginLeft: "0.25rem" }}>*</span>}
      </span>
      {children}
    </label>
  );
}
