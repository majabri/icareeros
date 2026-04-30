/**
 * /settings/profile — My Career
 * Career preferences stored in user_profiles:
 *   current_position, experience_level, target_roles, skills, location, open_to_remote
 */
"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase";

type Msg = { type: "success" | "error"; text: string };

const EXPERIENCE_LEVELS = [
  { value: "entry",     label: "Entry level (0–2 years)" },
  { value: "mid",       label: "Mid-level (3–5 years)" },
  { value: "senior",    label: "Senior (6–10 years)" },
  { value: "executive", label: "Executive (10+ years)" },
];

/** Tag chip input — press Enter or comma to add a tag */
function TagInput({
  tags,
  onChange,
  placeholder,
}: {
  tags: string[];
  onChange: (t: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  function add(raw: string) {
    const val = raw.trim().replace(/,+$/, "");
    if (val && !tags.includes(val)) onChange([...tags, val]);
    setInput("");
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(input);
    }
    if (e.key === "Backspace" && !input && tags.length) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div
      className="flex min-h-[42px] flex-wrap gap-1.5 rounded-lg border border-gray-300 px-2.5 py-2 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 cursor-text"
      onClick={() => ref.current?.focus()}
    >
      {tags.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700"
        >
          {tag}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(tags.filter((t) => t !== tag));
            }}
            className="ml-0.5 text-blue-400 hover:text-blue-600"
            aria-label={`Remove ${tag}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        ref={ref}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => { if (input.trim()) add(input); }}
        placeholder={tags.length === 0 ? placeholder : ""}
        className="min-w-[120px] flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none"
      />
    </div>
  );
}

export default function MyCareerPage() {
  const supabase = createClient();

  const [currentPosition, setCurrentPosition] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("");
  const [targetRoles, setTargetRoles]         = useState<string[]>([]);
  const [skills, setSkills]                   = useState<string[]>([]);
  const [location, setLocation]               = useState("");
  const [openToRemote, setOpenToRemote]       = useState(false);

  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState<Msg | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId]   = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const u = data.user;
        if (!u) return;
        setUserId(u.id);
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("current_position, experience_level, target_roles, skills, location, open_to_remote")
          .eq("user_id", u.id)
          .maybeSingle();
        if (profile) {
          setCurrentPosition(profile.current_position ?? "");
          setExperienceLevel(profile.experience_level ?? "");
          setTargetRoles(profile.target_roles ?? []);
          setSkills(profile.skills ?? []);
          setLocation(profile.location ?? "");
          setOpenToRemote(profile.open_to_remote ?? false);
        }
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setSaving(true);
    setMsg(null);
    try {
      const { error } = await supabase.from("user_profiles").upsert(
        {
          user_id:          userId,
          current_position: currentPosition.trim() || null,
          experience_level: experienceLevel || null,
          target_roles:     targetRoles,
          skills:           skills,
          location:         location.trim() || null,
          open_to_remote:   openToRemote,
          updated_at:       new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (error) throw new Error(error.message);
      setMsg({ type: "success", text: "Career profile saved." });
    } catch (err) {
      setMsg({ type: "error", text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSave}>
      <div className="space-y-8">

        {/* ── Where you are ───────────────────────────────────────── */}
        <section className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Where you are</h2>
            <p className="mt-1 text-sm text-gray-500">
              Your current role and experience. Used to calibrate advice and match scores.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Current position
              </label>
              <input
                type="text"
                value={currentPosition}
                onChange={(e) => setCurrentPosition(e.target.value)}
                placeholder="e.g. Senior Product Manager"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Experience level
              </label>
              <select
                value={experienceLevel}
                onChange={(e) => setExperienceLevel(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Select level</option>
                {EXPERIENCE_LEVELS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* ── Where you're going ──────────────────────────────────── */}
        <section className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Where you're going</h2>
            <p className="mt-1 text-sm text-gray-500">
              Target roles and skills you're building toward. Press Enter or comma after each item.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Target roles</label>
            <TagInput
              tags={targetRoles}
              onChange={setTargetRoles}
              placeholder="e.g. VP of Product, Director of Engineering…"
            />
            <p className="mt-1 text-xs text-gray-400">Press Enter or comma after each role</p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Key skills</label>
            <TagInput
              tags={skills}
              onChange={setSkills}
              placeholder="e.g. Python, Product Strategy, SQL…"
            />
            <p className="mt-1 text-xs text-gray-400">Press Enter or comma after each skill</p>
          </div>
        </section>

        {/* ── Location & work style ────────────────────────────────── */}
        <section className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Location & work style</h2>
            <p className="mt-1 text-sm text-gray-500">
              Helps surface the right opportunities for your situation.
            </p>
          </div>

          <div className="max-w-sm">
            <label className="mb-1 block text-sm font-medium text-gray-700">Location</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. New York, NY · San Francisco Bay Area"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-3">
            <div className="relative">
              <input
                type="checkbox"
                checked={openToRemote}
                onChange={(e) => setOpenToRemote(e.target.checked)}
                className="peer sr-only"
              />
              <div className="h-5 w-9 rounded-full bg-gray-200 transition-colors peer-checked:bg-blue-600" />
              <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
            </div>
            <span className="text-sm font-medium text-gray-700">Open to remote opportunities</span>
          </label>
        </section>

        {/* ── Save ────────────────────────────────────────────────── */}
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : "Save career profile"}
          </button>
          {msg && (
            <span className={`text-sm ${msg.type === "success" ? "text-green-600" : "text-red-600"}`}>
              {msg.type === "success" ? "✓ " : "⚠ "}{msg.text}
            </span>
          )}
        </div>

      </div>
    </form>
  );
}
