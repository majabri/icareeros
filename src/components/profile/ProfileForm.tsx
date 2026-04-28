"use client";

/**
 * ProfileForm — Evaluate Stage entry point
 *
 * Renders the Career OS profile editing UI (basic info, current role,
 * target roles, skills, experience level, location / remote prefs).
 * All writes go to the `user_profiles` table via Supabase upsert.
 *
 * Day 21: After a successful save, automatically triggers the Evaluate AI
 * stage (if an active cycle exists) and shows inline results.
 */

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { advanceStage } from "@/orchestrator/careerOsOrchestrator";
import type { EvaluationResult } from "@/services/ai/evaluateService";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserProfile {
  user_id:          string;
  full_name:        string;
  current_position: string;
  target_roles:     string[];
  skills:           string[];
  experience_level: string;
  location:         string;
  open_to_remote:   boolean;
}

const EXPERIENCE_LEVELS = [
  { value: "entry",     label: "Entry level (0-2 yrs)" },
  { value: "mid",       label: "Mid level (2-5 yrs)" },
  { value: "senior",    label: "Senior (5-10 yrs)" },
  { value: "staff",     label: "Staff / Principal (10+ yrs)" },
  { value: "executive", label: "Executive / VP / C-Suite" },
];

// ─── Tag input helper ─────────────────────────────────────────────────────────

interface TagInputProps {
  id:          string;
  label:       string;
  placeholder: string;
  tags:        string[];
  onAdd:       (tag: string) => void;
  onRemove:    (tag: string) => void;
}

function TagInput({ id, label, placeholder, tags, onAdd, onRemove }: TagInputProps) {
  const [draft, setDraft] = useState("");

  function commit() {
    const val = draft.trim();
    if (val && !tags.includes(val)) onAdd(val);
    setDraft("");
  }

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-0.5
                         text-sm font-medium text-blue-700 border border-blue-200"
            >
              {tag}
              <button
                type="button"
                onClick={() => onRemove(tag)}
                aria-label={"Remove " + tag}
                className="ml-0.5 text-blue-400 hover:text-blue-600 transition-colors"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900
                     placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none
                     focus:ring-1 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={commit}
          disabled={!draft.trim()}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium
                     text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-40 transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ─── Evaluate results panel ───────────────────────────────────────────────────

interface EvalResultPanelProps {
  result: EvaluationResult;
}

function EvalResultPanel({ result }: EvalResultPanelProps) {
  const scoreColor =
    result.marketFitScore >= 70 ? "text-green-700 bg-green-50 border-green-200"
    : result.marketFitScore >= 45 ? "text-amber-700 bg-amber-50 border-amber-200"
    : "text-red-700 bg-red-50 border-red-200";

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-xl" aria-hidden="true">🔍</span>
        <h3 className="font-semibold text-blue-900">Evaluate — AI results</h3>
        <span className="ml-auto text-xs text-blue-500">Stage 1 complete</span>
      </div>

      {/* Market fit score */}
      <div className={"inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold " + scoreColor}>
        Market fit score: {result.marketFitScore}/100
      </div>

      {/* Summary */}
      <p className="text-sm text-gray-700 leading-relaxed">{result.summary}</p>

      {/* Skill gaps */}
      {result.gaps.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Top skill gaps for your target roles
          </p>
          <div className="flex flex-wrap gap-2">
            {result.gaps.map((gap) => (
              <span
                key={gap}
                className="rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5
                           text-xs font-medium text-red-700"
              >
                {gap}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Verified skills */}
      {result.skills.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Verified skills
          </p>
          <div className="flex flex-wrap gap-2">
            {result.skills.slice(0, 8).map((skill) => (
              <span
                key={skill}
                className="rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5
                           text-xs font-medium text-green-700"
              >
                {skill}
              </span>
            ))}
            {result.skills.length > 8 && (
              <span className="text-xs text-gray-400">
                +{result.skills.length - 8} more
              </span>
            )}
          </div>
        </div>
      )}

      <a
        href="/dashboard"
        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2
                   text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
      >
        View full Career OS dashboard
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
        </svg>
      </a>
    </div>
  );
}

// ─── Main form ────────────────────────────────────────────────────────────────

interface ProfileFormProps {
  initial:  UserProfile | null;
  userId:   string;
  cycleId?: string | null;   // active Career OS cycle (passed from page)
}

export function ProfileForm({ initial, userId, cycleId }: ProfileFormProps) {
  const [form, setForm] = useState<UserProfile>({
    user_id:          userId,
    full_name:        initial?.full_name        ?? "",
    current_position: initial?.current_position ?? "",
    target_roles:     initial?.target_roles     ?? [],
    skills:           initial?.skills           ?? [],
    experience_level: initial?.experience_level ?? "",
    location:         initial?.location         ?? "",
    open_to_remote:   initial?.open_to_remote   ?? true,
  });

  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [saveErr,   setSaveErr]   = useState<string | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evalResult, setEvalResult] = useState<EvaluationResult | null>(null);
  const [evalErr,   setEvalErr]   = useState<string | null>(null);

  function field<K extends keyof UserProfile>(key: K, value: UserProfile[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
    setEvalResult(null);
  }

  function addTag(key: "target_roles" | "skills", tag: string) {
    field(key, [...(form[key] as string[]), tag]);
  }

  function removeTag(key: "target_roles" | "skills", tag: string) {
    field(key, (form[key] as string[]).filter((t) => t !== tag));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setSaveErr(null);
    setEvalErr(null);

    try {
      // 1. Save profile to Supabase
      const supabase = createClient();
      const { error } = await supabase
        .from("user_profiles")
        .upsert(
          { ...form, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );

      if (error) throw new Error(error.message);
      setSaved(true);
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : "Save failed — please try again.");
      setSaving(false);
      return;
    }

    setSaving(false);

    // 2. Auto-trigger Evaluate AI if an active cycle exists
    if (!cycleId) return;

    try {
      setEvaluating(true);
      const stageResult = await advanceStage(userId, cycleId, "evaluate");

      if (stageResult.error) {
        setEvalErr("AI evaluation failed: " + stageResult.error);
        return;
      }

      // Load the result from career_os_stages.notes (persisted by stageRouter)
      const supabase = createClient();
      const { data } = await supabase
        .from("career_os_stages")
        .select("notes")
        .eq("cycle_id", cycleId)
        .eq("stage", "evaluate")
        .maybeSingle();

      if (data?.notes && typeof data.notes === "object") {
        setEvalResult(data.notes as unknown as EvaluationResult);
      }
    } catch (err) {
      setEvalErr("AI evaluation failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setEvaluating(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* ── Section 1: Basic info ────────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Basic information</h2>
        <div>
          <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-1">
            Full name
          </label>
          <input
            id="full_name"
            type="text"
            value={form.full_name}
            onChange={(e) => field("full_name", e.target.value)}
            placeholder="Your full name"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900
                       placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none
                       focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </section>

      {/* ── Section 2: Current role ──────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Current role</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="current_position" className="block text-sm font-medium text-gray-700 mb-1">
              Current title / position
            </label>
            <input
              id="current_position"
              type="text"
              value={form.current_position}
              onChange={(e) => field("current_position", e.target.value)}
              placeholder="e.g. Senior Engineer at Acme Corp"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900
                         placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none
                         focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="experience_level" className="block text-sm font-medium text-gray-700 mb-1">
              Experience level
            </label>
            <select
              id="experience_level"
              value={form.experience_level}
              onChange={(e) => field("experience_level", e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm
                         text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none
                         focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select level...</option>
              {EXPERIENCE_LEVELS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* ── Section 3: Target roles ──────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Target roles</h2>
        <p className="text-sm text-gray-500 mb-4">What roles are you aiming for? Add up to 5.</p>
        <TagInput
          id="target_roles"
          label="Target job title"
          placeholder="e.g. Staff Engineer, Engineering Manager"
          tags={form.target_roles}
          onAdd={(tag) => {
            if (form.target_roles.length < 5) addTag("target_roles", tag);
          }}
          onRemove={(tag) => removeTag("target_roles", tag)}
        />
      </section>

      {/* ── Section 4: Skills ────────────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Skills</h2>
        <p className="text-sm text-gray-500 mb-4">Add your core technical and professional skills.</p>
        <TagInput
          id="skills"
          label="Skill"
          placeholder="e.g. TypeScript, React, System Design"
          tags={form.skills}
          onAdd={(tag) => addTag("skills", tag)}
          onRemove={(tag) => removeTag("skills", tag)}
        />
      </section>

      {/* ── Section 5: Location & remote ─────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Location &amp; remote</h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">
              Location
            </label>
            <input
              id="location"
              type="text"
              value={form.location}
              onChange={(e) => field("location", e.target.value)}
              placeholder="e.g. San Francisco, CA or Remote"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900
                         placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none
                         focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <label className="flex cursor-pointer items-center gap-3 text-sm text-gray-700 select-none">
            <input
              id="open_to_remote"
              type="checkbox"
              checked={form.open_to_remote}
              onChange={(e) => field("open_to_remote", e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Open to remote opportunities</span>
          </label>
        </div>
      </section>

      {/* ── Save bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={saving || evaluating}
          className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white
                     shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving..." : evaluating ? "Analyzing..." : "Save profile"}
        </button>

        {saved && !evaluating && !evalResult && (
          <span className="text-sm font-medium text-green-600">✓ Profile saved</span>
        )}

        {evaluating && (
          <span className="flex items-center gap-2 text-sm text-blue-600">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            Running AI evaluation...
          </span>
        )}

        {saveErr && (
          <span className="text-sm text-red-600">{saveErr}</span>
        )}
      </div>

      {/* ── Evaluate error ────────────────────────────────────────────────── */}
      {evalErr && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {evalErr}
        </div>
      )}

      {/* ── Evaluate results ─────────────────────────────────────────────── */}
      {evalResult && <EvalResultPanel result={evalResult} />}

      {/* ── No active cycle nudge ─────────────────────────────────────────── */}
      {saved && !cycleId && !saveErr && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          Profile saved! Start a Career OS cycle on the{" "}
          <a href="/dashboard" className="font-semibold underline hover:text-amber-900">
            dashboard
          </a>{" "}
          to run your AI evaluation.
        </div>
      )}
    </form>
  );
}
