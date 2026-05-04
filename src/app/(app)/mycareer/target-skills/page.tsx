"use client";

/**
 * /mycareer/target-skills
 *
 * Aspirational targets — what the user wants to acquire next.
 * Three sections:
 *   - Target Skills        (tag-style chips)
 *   - Target Education     (rows: degree, institution, target_date)
 *   - Target Certifications (rows: name, issuer, target_date)
 *
 * On mount the page asks /api/career-os/target-suggestions to generate
 * AI-suggested items (based on the user's career profile). Each suggestion
 * appears in a "Suggested for you" panel inside its section with a "+ Add"
 * button. Clicking "+ Add" promotes the suggestion to the confirmed list.
 *
 * Persists confirmed targets to:
 *   career_profiles.target_skills
 *   career_profiles.target_education
 *   career_profiles.target_certifications
 *
 * Distinct from /mycareer/profile which holds CURRENT skills/education/certs
 * (what the user already has).
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
interface SkillSuggestion       { name: string;        reason: string }
interface EducationSuggestion   { degree: string;      institution: string; reason: string }
interface CertificationSuggestion { name: string;      issuer: string;      reason: string }

const EMPTY_EDU:  TargetEducation     = { degree: "", institution: "", target_date: "" };
const EMPTY_CERT: TargetCertification = { name: "",   issuer: "",      target_date: "" };

export default function TargetSkillsPage() {
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);

  // Confirmed targets
  const [skills, setSkills] = useState<string[]>([]);
  const [skillDraft, setSkillDraft] = useState("");
  const [education, setEducation] = useState<TargetEducation[]>([]);
  const [certifications, setCertifications] = useState<TargetCertification[]>([]);

  // Suggestions
  const [skillSugs, setSkillSugs] = useState<SkillSuggestion[]>([]);
  const [eduSugs,   setEduSugs]   = useState<EducationSuggestion[]>([]);
  const [certSugs,  setCertSugs]  = useState<CertificationSuggestion[]>([]);
  const [sugsLoading, setSugsLoading] = useState(false);
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
        .select("target_skills, target_education, target_certifications")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;

      setSkills((data?.target_skills as string[]) ?? []);
      setEducation((data?.target_education as TargetEducation[]) ?? []);
      setCertifications((data?.target_certifications as TargetCertification[]) ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  // ── Fetch AI suggestions on mount (after profile loads) ──────────────────
  const fetchSuggestions = useCallback(async () => {
    setSugsLoading(true);
    setSugsErr(null);
    try {
      const res = await fetch("/api/career-os/target-suggestions", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? `Failed (${res.status})`);
      }
      setSkillSugs(Array.isArray(data.skills) ? data.skills : []);
      setEduSugs(Array.isArray(data.education) ? data.education : []);
      setCertSugs(Array.isArray(data.certifications) ? data.certifications : []);
    } catch (e) {
      setSugsErr(e instanceof Error ? e.message : "Failed to load suggestions");
    } finally {
      setSugsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && userId) void fetchSuggestions();
  }, [loading, userId, fetchSuggestions]);

  // ── Skill chip handlers ────────────────────────────────────────────────────
  function addSkill() {
    const t = skillDraft.trim();
    if (!t) return;
    if (skills.some(s => s.toLowerCase() === t.toLowerCase())) {
      setSkillDraft("");
      return;
    }
    setSkills([...skills, t]);
    setSkillDraft("");
  }
  function removeSkill(idx: number) {
    setSkills(skills.filter((_, i) => i !== idx));
  }
  function confirmSkillSuggestion(name: string) {
    if (!skills.some(s => s.toLowerCase() === name.toLowerCase())) {
      setSkills([...skills, name]);
    }
    setSkillSugs(skillSugs.filter(s => s.name.toLowerCase() !== name.toLowerCase()));
  }
  function dismissSkillSuggestion(name: string) {
    setSkillSugs(skillSugs.filter(s => s.name.toLowerCase() !== name.toLowerCase()));
  }

  // ── Education handlers ─────────────────────────────────────────────────────
  function addEducation() { setEducation([...education, { ...EMPTY_EDU }]); }
  function updateEducation(idx: number, patch: Partial<TargetEducation>) {
    setEducation(education.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }
  function removeEducation(idx: number) {
    setEducation(education.filter((_, i) => i !== idx));
  }
  function confirmEduSuggestion(s: EducationSuggestion) {
    setEducation([...education, { degree: s.degree, institution: s.institution, target_date: "" }]);
    setEduSugs(eduSugs.filter(x => !(x.degree === s.degree && x.institution === s.institution)));
  }
  function dismissEduSuggestion(s: EducationSuggestion) {
    setEduSugs(eduSugs.filter(x => !(x.degree === s.degree && x.institution === s.institution)));
  }

  // ── Cert handlers ──────────────────────────────────────────────────────────
  function addCert() { setCertifications([...certifications, { ...EMPTY_CERT }]); }
  function updateCert(idx: number, patch: Partial<TargetCertification>) {
    setCertifications(certifications.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }
  function removeCert(idx: number) {
    setCertifications(certifications.filter((_, i) => i !== idx));
  }
  function confirmCertSuggestion(s: CertificationSuggestion) {
    setCertifications([...certifications, { name: s.name, issuer: s.issuer, target_date: "" }]);
    setCertSugs(certSugs.filter(x => !(x.name === s.name && x.issuer === s.issuer)));
  }
  function dismissCertSuggestion(s: CertificationSuggestion) {
    setCertSugs(certSugs.filter(x => !(x.name === s.name && x.issuer === s.issuer)));
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
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    setSaving(false);
    if (error) setMsg({ kind: "err", text: error.message });
    else setMsg({ kind: "ok", text: "Targets saved." });
  }, [userId, skills, education, certifications, supabase]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-gray-500">
          What you want to acquire next — skills, education, or certifications you&apos;re working toward. Suggestions below are AI-generated from your profile, target roles, and current career-cycle goal; click <strong>Confirm</strong> on any you want to add.
        </p>
      </header>

      {sugsErr && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Couldn&apos;t load suggestions: {sugsErr}{" "}
          <button type="button" onClick={() => void fetchSuggestions()} className="underline hover:no-underline">Retry</button>
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

        {/* Confirmed skill chips */}
        {skills.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {skills.map((s, i) => (
              <span key={`${s}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-700 border border-brand-100">
                {s}
                <button type="button" onClick={() => removeSkill(i)} className="ml-1 text-brand-400 hover:text-brand-600" aria-label={`Remove ${s}`}>×</button>
              </span>
            ))}
          </div>
        )}

        <input
          type="text"
          value={skillDraft}
          onChange={e => setSkillDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addSkill(); }
          }}
          onBlur={addSkill}
          placeholder="Add your own — e.g. Kubernetes, GraphQL, System Design"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
        />

        {/* Skill suggestions */}
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {sugsLoading ? "Loading suggestions…" : skillSugs.length > 0 ? "Suggested for you — confirm to add" : "No skill suggestions"}
          </p>
          {!sugsLoading && skillSugs.length > 0 && (
            <ul className="space-y-2">
              {skillSugs.map((s, i) => (
                <li key={`${s.name}-${i}`} className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => confirmSkillSuggestion(s.name)}
                    className="mt-0.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                  >
                    ✓ Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => dismissSkillSuggestion(s.name)}
                    className="mt-0.5 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100"
                    aria-label="Dismiss"
                  >
                    ×
                  </button>
                  <div className="flex-1">
                    <span className="text-sm font-medium text-gray-900">{s.name}</span>
                    <span className="ml-2 text-xs text-gray-500">— {s.reason}</span>
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

        {/* Education suggestions */}
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {sugsLoading ? "Loading suggestions…" : eduSugs.length > 0 ? "Suggested for you — confirm to add" : "No education suggestions"}
          </p>
          {!sugsLoading && eduSugs.length > 0 && (
            <ul className="space-y-3">
              {eduSugs.map((s, i) => (
                <li key={`${s.degree}-${i}`} className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => confirmEduSuggestion(s)}
                    className="mt-0.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                  >
                    ✓ Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => dismissEduSuggestion(s)}
                    className="mt-0.5 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100"
                    aria-label="Dismiss"
                  >
                    ×
                  </button>
                  <div className="flex-1">
                    <span className="text-sm font-medium text-gray-900">{s.degree}</span>
                    <span className="text-sm text-gray-600"> — {s.institution}</span>
                    <p className="text-xs text-gray-500 mt-0.5">{s.reason}</p>
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

        {/* Certification suggestions */}
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {sugsLoading ? "Loading suggestions…" : certSugs.length > 0 ? "Suggested for you — confirm to add" : "No certification suggestions"}
          </p>
          {!sugsLoading && certSugs.length > 0 && (
            <ul className="space-y-3">
              {certSugs.map((s, i) => (
                <li key={`${s.name}-${i}`} className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => confirmCertSuggestion(s)}
                    className="mt-0.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                  >
                    ✓ Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => dismissCertSuggestion(s)}
                    className="mt-0.5 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100"
                    aria-label="Dismiss"
                  >
                    ×
                  </button>
                  <div className="flex-1">
                    <span className="text-sm font-medium text-gray-900">{s.name}</span>
                    <span className="text-sm text-gray-600"> — {s.issuer}</span>
                    <p className="text-xs text-gray-500 mt-0.5">{s.reason}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── Save bar ──────────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 -mx-4 sm:-mx-6 border-t border-gray-200 bg-white px-4 py-4 sm:px-6 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => void fetchSuggestions()}
          disabled={sugsLoading}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          {sugsLoading ? "Loading…" : "Refresh suggestions"}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {saving ? "Saving…" : "Save targets"}
        </button>
      </div>
    </div>
  );
}
