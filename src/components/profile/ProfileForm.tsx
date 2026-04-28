"use client";

/**
 * ProfileForm — Evaluate Stage entry point
 *
 * Renders the Career OS profile editing UI (basic info, current role,
 * target roles, skills, experience level, location / remote prefs).
 * All writes go to the `user_profiles` table via Supabase upsert.
 */

import { useState } from "react";
import { createClient } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserProfile {
  user_id:          string;
  full_name:        string;
  current_position:     string;
  target_roles:     string[];
  skills:           string[];
  experience_level: string;
  location:         string;
  open_to_remote:   boolean;
}

const EXPERIENCE_LEVELS = [
  { value: "entry",     label: "Entry level (0–2 yrs)" },
  { value: "mid",       label: "Mid level (2–5 yrs)" },
  { value: "senior",    label: "Senior (5–10 yrs)" },
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

      {/* Existing tags */}
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
                aria-label={`Remove ${tag}`}
                className="ml-0.5 text-blue-400 hover:text-blue-600 transition-colors"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Add new tag */}
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

// ─── Main form ────────────────────────────────────────────────────────────────

interface ProfileFormProps {
  initial: UserProfile | null;
  userId:  string;
}

export function ProfileForm({ initial, userId }: ProfileFormProps) {
  const [form, setForm] = useState<UserProfile>({
    user_id:          userId,
    full_name:        initial?.full_name        ?? "",
    current_position:     initial?.current_position     ?? "",
    target_roles:     initial?.target_roles     ?? [],
    skills:           initial?.skills           ?? [],
    experience_level: initial?.experience_level ?? "",
    location:         initial?.location         ?? "",
    open_to_remote:   initial?.open_to_remote   ?? true,
  });

  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  function field<K extends keyof UserProfile>(key: K, value: UserProfile[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
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

    try {
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
    } finally {
      setSaving(false);
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
              <option value="">Select level…</option>
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
        <p className="text-sm text-gray-500 mb-4">
          What roles are you aiming for? Add up to 5.
        </p>
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
        <p className="text-sm text-gray-500 mb-4">
          Add your core technical and professional skills.
        </p>
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
          disabled={saving}
          className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white
                     shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : "Save profile"}
        </button>

        {saved && (
          <span className="text-sm font-medium text-green-600">
            ✓ Profile saved
          </span>
        )}

        {saveErr && (
          <span className="text-sm text-red-600">{saveErr}</span>
        )}
      </div>
    </form>
  );
}
