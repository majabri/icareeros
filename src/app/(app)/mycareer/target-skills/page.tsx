"use client";

/**
 * /mycareer/target-skills
 *
 * Aspirational targets — what the user wants to acquire next.
 * Three sections, all start empty:
 *   - Target Skills (tag-style chips)
 *   - Target Education (rows: degree, institution, target date)
 *   - Target Certifications (rows: name, issuer, target date)
 *
 * Persists to career_profiles.{target_skills,target_education,target_certifications}.
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

const EMPTY_EDU: TargetEducation = { degree: "", institution: "", target_date: "" };
const EMPTY_CERT: TargetCertification = { name: "", issuer: "", target_date: "" };

export default function TargetSkillsPage() {
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);

  const [skills, setSkills] = useState<string[]>([]);
  const [skillDraft, setSkillDraft] = useState("");
  const [education, setEducation] = useState<TargetEducation[]>([]);
  const [certifications, setCertifications] = useState<TargetCertification[]>([]);

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

  // ── Education handlers ─────────────────────────────────────────────────────
  function addEducation() { setEducation([...education, { ...EMPTY_EDU }]); }
  function updateEducation(idx: number, patch: Partial<TargetEducation>) {
    setEducation(education.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }
  function removeEducation(idx: number) {
    setEducation(education.filter((_, i) => i !== idx));
  }

  // ── Cert handlers ──────────────────────────────────────────────────────────
  function addCert() { setCertifications([...certifications, { ...EMPTY_CERT }]); }
  function updateCert(idx: number, patch: Partial<TargetCertification>) {
    setCertifications(certifications.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }
  function removeCert(idx: number) {
    setCertifications(certifications.filter((_, i) => i !== idx));
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!userId) return;
    setSaving(true);
    setMsg(null);

    // Drop fully-empty rows so we don't persist whitespace
    const cleanEdu = education.filter(e => e.degree.trim() || e.institution.trim() || e.target_date.trim());
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
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Target Skills</h1>
        <p className="mt-1 text-sm text-gray-500">
          What you want to acquire next — skills, education, or certifications you&apos;re working toward.
        </p>
      </header>

      {msg && (
        <div className={`rounded-lg px-4 py-3 text-sm ${msg.kind === "ok" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {msg.kind === "ok" ? "✓ " : "⚠ "}{msg.text}
        </div>
      )}

      {/* ── Target Skills ─────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Skills</h2>
          <p className="text-sm text-gray-500">Skills you want to learn. Press Enter or comma to add.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {skills.map((s, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-700 border border-brand-100">
              {s}
              <button type="button" onClick={() => removeSkill(i)} className="ml-1 text-brand-400 hover:text-brand-600" aria-label={`Remove ${s}`}>×</button>
            </span>
          ))}
        </div>

        <input
          type="text"
          value={skillDraft}
          onChange={e => setSkillDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addSkill(); }
          }}
          onBlur={addSkill}
          placeholder="e.g. Kubernetes, GraphQL, System Design"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
      </section>

      {/* ── Target Education ──────────────────────────────────────────────── */}
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
      </section>

      {/* ── Target Certifications ─────────────────────────────────────────── */}
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
                  <input value={cert.name} onChange={e => updateCert(i, { name: e.target.value })} placeholder="Certification name (e.g. AWS Solutions Architect)" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                  <input value={cert.issuer} onChange={e => updateCert(i, { issuer: e.target.value })} placeholder="Issuing organization" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                  <input value={cert.target_date} onChange={e => updateCert(i, { target_date: e.target.value })} placeholder="Target date" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                </div>
                <button type="button" onClick={() => removeCert(i)} className="text-xs text-red-600 hover:text-red-700">Remove</button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Save bar ──────────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 -mx-4 sm:-mx-6 border-t border-gray-200 bg-white px-4 py-4 sm:px-6 flex items-center justify-end gap-3">
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
