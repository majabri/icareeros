"use client";

/**
 * TargetSkillsPanel — collapsible section rendered at the top of /learn.
 *
 * 2026-06-18 (5-stage refactor) — moved here from `/targetskills` (page
 * retired; URL redirects to `/learn` via next.config.js). Logic identical
 * to the prior page; only the wrapping changed (page → collapsible card).
 */

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

interface TargetEducation {
  degree: string;
  institution: string;
  target_date: string;
}
interface TargetCertification {
  name: string;
  issuer: string;
  target_date: string;
}
interface SkillSuggestion         { name: string;        source_role: string; reason: string }
interface EducationSuggestion     { degree: string;      institution: string; source_role: string; reason: string }
interface CertificationSuggestion { name: string;        issuer: string;      source_role: string; reason: string }

interface SuggestionResponse {
  target_roles_used: string[];
  skills: SkillSuggestion[];
  education: EducationSuggestion[];
  certifications: CertificationSuggestion[];
  _meta?: {
    had_target_roles: boolean;
    had_cycle_goal: boolean;
    inferred: boolean;
  };
}

const EMPTY_EDU:  TargetEducation     = { degree: "", institution: "", target_date: "" };
const EMPTY_CERT: TargetCertification = { name: "",   issuer: "",      target_date: "" };

// ── Source-role pill ─────────────────────────────────────────────────────────
function SourceRolePill({ role }: { role: string }) {
  if (!role) return null;
  return (
    <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-700 border border-blue-100">
      for: {role}
    </span>
  );
}

// ── UAT 2026-05-10: target-suggestions response cache ────────────────────────
// The /api/career-os/target-suggestions route makes a Sonnet 4.6 tool-use call
// that consistently takes 8-15s. Caching the response in localStorage with a
// stale-while-revalidate pattern means repeat visits show instantly; the
// background revalidate keeps things fresh without blocking the UI.
//
// Key is per-user so device-shared accounts don't cross-pollute. Schema
// versioned in the key itself ("v1") so a future shape change won't try to
// hydrate stale cache.
type TargetSuggestionsCache = {
  generatedAt: number; // epoch ms
  payload: {
    skills:         SkillSuggestion[];
    education:      EducationSuggestion[];
    certifications: CertificationSuggestion[];
    rolesUsed:      string[];
    meta:           SuggestionResponse["_meta"] | null;
  };
};
const TARGETSKILLS_CACHE_PREFIX = "targetskills:cache:v1:";
const TARGETSKILLS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function readTargetSuggestionsCache(userId: string): TargetSuggestionsCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TARGETSKILLS_CACHE_PREFIX + userId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TargetSuggestionsCache;
    if (!parsed || typeof parsed.generatedAt !== "number" || !parsed.payload) return null;
    // Reject entries older than the TTL — we treat them as miss.
    if (Date.now() - parsed.generatedAt > TARGETSKILLS_CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeTargetSuggestionsCache(userId: string, payload: TargetSuggestionsCache["payload"]) {
  if (typeof window === "undefined") return;
  try {
    const entry: TargetSuggestionsCache = { generatedAt: Date.now(), payload };
    window.localStorage.setItem(TARGETSKILLS_CACHE_PREFIX + userId, JSON.stringify(entry));
  } catch {
    /* quota / private-mode — silently skip */
  }
}

function formatAgo(ms: number): string {
  const sec = Math.max(1, Math.floor(ms / 1000));
  if (sec < 60)    return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60)    return `${min}m ago`;
  const hr  = Math.floor(min / 60);
  if (hr  < 24)    return `${hr}h ago`;
  const day = Math.floor(hr  / 24);
  return `${day}d ago`;
}

export function TargetSkillsPanel() {
  const supabase = createClient();
  // 2026-06-18 (5-stage refactor) — collapsible wrapper.
  const [expanded, setExpanded] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Confirmed targets
  const [skills, setSkills] = useState<string[]>([]);
  const [skillDraft, setSkillDraft] = useState("");
  const [education, setEducation] = useState<TargetEducation[]>([]);
  const [certifications, setCertifications] = useState<TargetCertification[]>([]);

  // Dismissed (do-not-suggest blocklist) — persisted to career_profiles.dismissed_target_*
  const [dismissedSkills,        setDismissedSkills]        = useState<string[]>([]);
  const [dismissedEducation,     setDismissedEducation]     = useState<Array<{ degree: string; institution: string }>>([]);
  const [dismissedCertifications, setDismissedCertifications] = useState<Array<{ name: string; issuer: string }>>([]);

  // Suggestions
  const [skillSugs, setSkillSugs] = useState<SkillSuggestion[]>([]);
  const [eduSugs,   setEduSugs]   = useState<EducationSuggestion[]>([]);
  const [certSugs,  setCertSugs]  = useState<CertificationSuggestion[]>([]);
  const [rolesUsed, setRolesUsed] = useState<string[]>([]);
  const [meta, setMeta] = useState<SuggestionResponse["_meta"] | null>(null);
  const [sugsLoading, setSugsLoading] = useState(false);
  const [sugsFromCache, setSugsFromCache] = useState(false);
  const [sugsGeneratedAt, setSugsGeneratedAt] = useState<number | null>(null);
  const [sugsErr,     setSugsErr]     = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // ── Load existing targets ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) { setLoading(false); return; }
      setUserId(user.id);

      const { data } = await supabase
        .from("career_profiles")
        .select("target_skills, target_education, target_certifications, dismissed_target_skills, dismissed_target_education, dismissed_target_certifications")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;

      setSkills((data?.target_skills as string[]) ?? []);
      setEducation((data?.target_education as TargetEducation[]) ?? []);
      setCertifications((data?.target_certifications as TargetCertification[]) ?? []);
      setDismissedSkills((data?.dismissed_target_skills as string[]) ?? []);
      setDismissedEducation((data?.dismissed_target_education as Array<{ degree: string; institution: string }>) ?? []);
      setDismissedCertifications((data?.dismissed_target_certifications as Array<{ name: string; issuer: string }>) ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  // ── Fetch AI suggestions ──────────────────────────────────────────────────
  // UAT 2026-05-10: stale-while-revalidate. On cache hit we hydrate state
  // synchronously so the page renders instantly, then either skip the network
  // call (default) or refresh in the background (when force=true).
  const fetchSuggestions = useCallback(async (opts: { force?: boolean } = {}) => {
    const force = opts.force === true;

    // Cache check — only on the implicit auto-load path. The explicit
    // "Refresh suggestions" button always bypasses cache.
    if (!force && userId) {
      const cached = readTargetSuggestionsCache(userId);
      if (cached) {
        setSkillSugs(cached.payload.skills);
        setEduSugs(cached.payload.education);
        setCertSugs(cached.payload.certifications);
        setRolesUsed(cached.payload.rolesUsed);
        setMeta(cached.payload.meta);
        setSugsGeneratedAt(cached.generatedAt);
        setSugsFromCache(true);
        // Cache hit → no network. The user can hit Refresh if they want fresh.
        return;
      }
    }

    setSugsLoading(true);
    setSugsErr(null);
    try {
      const res = await fetch("/api/career-os/target-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dismissedSkills,
          dismissedEducation,
          dismissedCertifications,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Failed (${res.status})`);
      const skills = Array.isArray(data.skills) ? data.skills : [];
      const education = Array.isArray(data.education) ? data.education : [];
      const certifications = Array.isArray(data.certifications) ? data.certifications : [];
      const rolesUsed = Array.isArray(data.target_roles_used) ? data.target_roles_used : [];
      const meta = data._meta ?? null;

      setSkillSugs(skills);
      setEduSugs(education);
      setCertSugs(certifications);
      setRolesUsed(rolesUsed);
      setMeta(meta);
      setSugsFromCache(false);
      setSugsGeneratedAt(Date.now());

      // Persist freshly-fetched result for next visit.
      if (userId) {
        writeTargetSuggestionsCache(userId, { skills, education, certifications, rolesUsed, meta });
      }
    } catch (e) {
      setSugsErr(e instanceof Error ? e.message : "Failed to load suggestions");
    } finally {
      setSugsLoading(false);
    }
  }, [userId, dismissedSkills, dismissedEducation, dismissedCertifications]);

  useEffect(() => {
    if (!loading && userId) void fetchSuggestions();
    // We deliberately do NOT include fetchSuggestions in this effect's deps —
    // we only want to fetch on initial load, not every time the user dismisses
    // an item. The "Refresh suggestions" button is the explicit re-fetch path.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, userId]);

  // ── Skill handlers ─────────────────────────────────────────────────────────
  function addSkill() {
    const t = skillDraft.trim();
    if (!t) return;
    if (!skills.some(s => s.toLowerCase() === t.toLowerCase())) {
      setSkills([...skills, t]);
    }
    setSkillDraft("");
  }
  function removeSkill(idx: number) {
    const removed = skills[idx];
    setSkills(skills.filter((_, i) => i !== idx));
    if (removed && !dismissedSkills.some(d => d.toLowerCase() === removed.toLowerCase())) {
      setDismissedSkills([...dismissedSkills, removed]);
    }
  }
  function confirmSkillSuggestion(name: string) {
    if (!skills.some(s => s.toLowerCase() === name.toLowerCase())) setSkills([...skills, name]);
    setSkillSugs(skillSugs.filter(s => s.name.toLowerCase() !== name.toLowerCase()));
  }
  function dismissSkillSuggestion(name: string) {
    setSkillSugs(skillSugs.filter(s => s.name.toLowerCase() !== name.toLowerCase()));
    if (!dismissedSkills.some(d => d.toLowerCase() === name.toLowerCase())) {
      setDismissedSkills([...dismissedSkills, name]);
    }
  }

  // ── Education handlers ─────────────────────────────────────────────────────
  function addEducation() { setEducation([...education, { ...EMPTY_EDU }]); }
  function updateEducation(idx: number, patch: Partial<TargetEducation>) {
    setEducation(education.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }
  function removeEducation(idx: number) {
    const removed = education[idx];
    setEducation(education.filter((_, i) => i !== idx));
    if (removed && (removed.degree || removed.institution)) {
      const key = { degree: removed.degree, institution: removed.institution };
      if (!dismissedEducation.some(d => d.degree === key.degree && d.institution === key.institution)) {
        setDismissedEducation([...dismissedEducation, key]);
      }
    }
  }
  function confirmEduSuggestion(s: EducationSuggestion) {
    setEducation([...education, { degree: s.degree, institution: s.institution, target_date: "" }]);
    setEduSugs(eduSugs.filter(x => !(x.degree === s.degree && x.institution === s.institution)));
  }
  function dismissEduSuggestion(s: EducationSuggestion) {
    setEduSugs(eduSugs.filter(x => !(x.degree === s.degree && x.institution === s.institution)));
    if (!dismissedEducation.some(d => d.degree === s.degree && d.institution === s.institution)) {
      setDismissedEducation([...dismissedEducation, { degree: s.degree, institution: s.institution }]);
    }
  }

  // ── Cert handlers ──────────────────────────────────────────────────────────
  function addCert() { setCertifications([...certifications, { ...EMPTY_CERT }]); }
  function updateCert(idx: number, patch: Partial<TargetCertification>) {
    setCertifications(certifications.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }
  function removeCert(idx: number) {
    const removed = certifications[idx];
    setCertifications(certifications.filter((_, i) => i !== idx));
    if (removed && (removed.name || removed.issuer)) {
      const key = { name: removed.name, issuer: removed.issuer };
      if (!dismissedCertifications.some(d => d.name === key.name && d.issuer === key.issuer)) {
        setDismissedCertifications([...dismissedCertifications, key]);
      }
    }
  }
  function confirmCertSuggestion(s: CertificationSuggestion) {
    setCertifications([...certifications, { name: s.name, issuer: s.issuer, target_date: "" }]);
    setCertSugs(certSugs.filter(x => !(x.name === s.name && x.issuer === s.issuer)));
  }
  function dismissCertSuggestion(s: CertificationSuggestion) {
    setCertSugs(certSugs.filter(x => !(x.name === s.name && x.issuer === s.issuer)));
    if (!dismissedCertifications.some(d => d.name === s.name && d.issuer === s.issuer)) {
      setDismissedCertifications([...dismissedCertifications, { name: s.name, issuer: s.issuer }]);
    }
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!userId) return;
    setSaving(true);
    setMsg(null);

    const cleanEdu   = education.filter(e => e.degree.trim() || e.institution.trim() || e.target_date.trim());
    const cleanCerts = certifications.filter(c => c.name.trim() || c.issuer.trim() || c.target_date.trim());

    const { error } = await supabase
      .from("career_profiles")
      .upsert(
        {
          user_id: userId,
          target_skills: skills,
          target_education: cleanEdu,
          target_certifications: cleanCerts,
          dismissed_target_skills:         dismissedSkills,
          dismissed_target_education:      dismissedEducation,
          dismissed_target_certifications: dismissedCertifications,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    setSaving(false);
    if (error) setMsg({ kind: "err", text: error.message });
    else setMsg({ kind: "ok", text: "Targets saved." });
  }, [userId, skills, education, certifications, dismissedSkills, dismissedEducation, dismissedCertifications, supabase]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
      >
        <span className="text-sm font-semibold text-gray-900">Your Target Skills</span>
        <span className="text-xs text-gray-400" aria-hidden>{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && (
    <div className="space-y-6 border-t border-gray-100 p-4 sm:p-6">
      <header>
        <p className="text-sm text-gray-500">
          What you want to acquire next — researched against your target job titles. Suggestions below are AI-generated; click <strong>Confirm</strong> on any you want to add. You can also add your own.
        </p>
      </header>

      {/* Show which target roles were researched (+ cache status, UAT 2026-05-10) */}
      {!sugsLoading && rolesUsed.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <span>
            Researching for target job title{rolesUsed.length > 1 ? "s" : ""}:{" "}
            <strong>{rolesUsed.join(" · ")}</strong>
            {meta?.inferred && (
              <span className="ml-2 text-xs text-blue-600">
                (inferred from your profile — set explicit target roles in <a href="/careerprofile/preferences" className="underline hover:no-underline">Search Preferences</a>)
              </span>
            )}
          </span>
          {sugsGeneratedAt && (
            <span className="ml-auto flex items-center gap-2 text-xs text-blue-600">
              {sugsFromCache ? "Researched" : "Just researched"} {formatAgo(Date.now() - sugsGeneratedAt)}
              <button
                type="button"
                onClick={() => void fetchSuggestions({ force: true })}
                disabled={sugsLoading}
                className="rounded border border-blue-300 bg-white px-2 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                Refresh
              </button>
            </span>
          )}
        </div>
      )}

      {/* No target roles set at all */}
      {!sugsLoading && !sugsErr && rolesUsed.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No target job titles set. Add them in <a href="/careerprofile/preferences" className="underline font-medium hover:no-underline">Search Preferences</a> for tailored suggestions, then come back here.
        </div>
      )}

      {sugsErr && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Couldn&apos;t load suggestions: {sugsErr}{" "}
          <button type="button" onClick={() => void fetchSuggestions({ force: true })} className="underline hover:no-underline">Retry</button>
        </div>
      )}

      {msg && (
        <div className={`rounded-lg px-4 py-3 text-sm ${msg.kind === "ok" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {msg.kind === "ok" ? "✓ " : "⚠ "}{msg.text}
        </div>
      )}

      {/* ── Skills ─────────────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Skills</h2>
          <p className="text-sm text-gray-500">Skills you want to learn. Press Enter or comma to add manually.</p>
        </div>

        {skills.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {skills.map((s, i) => (
              <span key={`${s}-${i}`} className="inline-flex max-w-xs items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-700 border border-brand-100">
                <span className="truncate" title={s}>{s}</span>
                <button type="button" onClick={() => removeSkill(i)} className="ml-1 shrink-0 text-brand-400 hover:text-brand-600" aria-label={`Remove ${s}`}>×</button>
              </span>
            ))}
          </div>
        )}

        <input
          type="text"
          value={skillDraft}
          onChange={e => setSkillDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addSkill(); } }}
          onBlur={addSkill}
          placeholder="Add your own — e.g. Kubernetes, GraphQL, System Design"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
        />

        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {sugsLoading ? "Researching target job titles…" : skillSugs.length > 0 ? "Suggested for you — confirm to add" : "No skill suggestions"}
          </p>
          {!sugsLoading && skillSugs.length > 0 && (
            <ul className="space-y-3">
              {skillSugs.map((s, i) => (
                <li key={`${s.name}-${i}`} className="flex items-start gap-2">
                  <button type="button" onClick={() => confirmSkillSuggestion(s.name)}
                    className="mt-0.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 shrink-0">
                    ✓ Confirm
                  </button>
                  <button type="button" onClick={() => dismissSkillSuggestion(s.name)}
                    className="mt-0.5 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100 shrink-0" aria-label="Dismiss">
                    ×
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-sm font-medium text-gray-900">{s.name}</span>
                      <SourceRolePill role={s.source_role} />
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">{s.reason}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── Education ──────────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Education</h2>
            <p className="text-sm text-gray-500">Degrees or programs you want to pursue.</p>
          </div>
          <button type="button" onClick={addEducation} className="rounded-md border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100">+ Add</button>
        </div>

        {education.length === 0 ? (
          <p className="text-sm text-gray-400">No target education added yet.</p>
        ) : (
          <div className="space-y-3">
            {education.map((edu, i) => (
              <div key={i} className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <input value={edu.degree} onChange={e => updateEducation(i, { degree: e.target.value })} placeholder="Degree (e.g. MBA)" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                  <input value={edu.institution} onChange={e => updateEducation(i, { institution: e.target.value })} placeholder="Institution" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                  <input value={edu.target_date} onChange={e => updateEducation(i, { target_date: e.target.value })} placeholder="Target date (e.g. 2027)" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                </div>
                <button type="button" onClick={() => removeEducation(i)} className="text-xs text-red-600 hover:text-red-700">Remove</button>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {sugsLoading ? "Researching…" : eduSugs.length > 0 ? "Suggested for you — confirm to add" : "No education suggestions"}
          </p>
          {!sugsLoading && eduSugs.length > 0 && (
            <ul className="space-y-3">
              {eduSugs.map((s, i) => (
                <li key={`${s.degree}-${i}`} className="flex items-start gap-2">
                  <button type="button" onClick={() => confirmEduSuggestion(s)}
                    className="mt-0.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 shrink-0">
                    ✓ Confirm
                  </button>
                  <button type="button" onClick={() => dismissEduSuggestion(s)}
                    className="mt-0.5 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100 shrink-0" aria-label="Dismiss">
                    ×
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-sm font-medium text-gray-900">{s.degree}</span>
                      <span className="text-sm text-gray-600">— {s.institution}</span>
                      <SourceRolePill role={s.source_role} />
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">{s.reason}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── Certifications ─────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Certifications</h2>
            <p className="text-sm text-gray-500">Professional certifications you want to earn.</p>
          </div>
          <button type="button" onClick={addCert} className="rounded-md border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100">+ Add</button>
        </div>

        {certifications.length === 0 ? (
          <p className="text-sm text-gray-400">No target certifications added yet.</p>
        ) : (
          <div className="space-y-3">
            {certifications.map((cert, i) => (
              <div key={i} className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <input value={cert.name} onChange={e => updateCert(i, { name: e.target.value })} placeholder="Certification name" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                  <input value={cert.issuer} onChange={e => updateCert(i, { issuer: e.target.value })} placeholder="Issuing organization" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                  <input value={cert.target_date} onChange={e => updateCert(i, { target_date: e.target.value })} placeholder="Target date" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                </div>
                <button type="button" onClick={() => removeCert(i)} className="text-xs text-red-600 hover:text-red-700">Remove</button>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {sugsLoading ? "Researching…" : certSugs.length > 0 ? "Suggested for you — confirm to add" : "No certification suggestions"}
          </p>
          {!sugsLoading && certSugs.length > 0 && (
            <ul className="space-y-3">
              {certSugs.map((s, i) => (
                <li key={`${s.name}-${i}`} className="flex items-start gap-2">
                  <button type="button" onClick={() => confirmCertSuggestion(s)}
                    className="mt-0.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 shrink-0">
                    ✓ Confirm
                  </button>
                  <button type="button" onClick={() => dismissCertSuggestion(s)}
                    className="mt-0.5 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100 shrink-0" aria-label="Dismiss">
                    ×
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-sm font-medium text-gray-900">{s.name}</span>
                      <span className="text-sm text-gray-600">— {s.issuer}</span>
                      <SourceRolePill role={s.source_role} />
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">{s.reason}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── Save bar ──────────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 -mx-4 sm:-mx-6 border-t border-gray-200 bg-white px-4 py-4 sm:px-6 flex items-center justify-end gap-3">
        <button type="button" onClick={() => void fetchSuggestions({ force: true })} disabled={sugsLoading}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          {sugsLoading ? "Loading…" : "Refresh suggestions"}
        </button>
        <button type="button" onClick={handleSave} disabled={saving}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {saving ? "Saving…" : "Save targets"}
        </button>
      </div>
    </div>
      )}
    </section>
  );
}
