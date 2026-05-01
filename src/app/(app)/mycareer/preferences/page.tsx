"use client";

/**
 * /mycareer/preferences — Search & Match Criteria
 * Manages job search preferences: target roles, career level,
 * location, work mode, job type, salary, fit score, search mode.
 */

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase";

type Msg = { type: "success" | "error"; text: string };

const CAREER_LEVELS = [
  { value: "entry",     label: "Entry-Level / Junior" },
  { value: "mid",       label: "Mid-Level" },
  { value: "senior",    label: "Senior" },
  { value: "manager",   label: "Manager" },
  { value: "director",  label: "Director" },
  { value: "vp",        label: "VP / Senior Leadership" },
  { value: "executive", label: "C-Level / Executive" },
];

const WORK_MODES = [
  { value: "remote",    label: "Remote" },
  { value: "hybrid",    label: "Hybrid" },
  { value: "in-office", label: "In-Office" },
];

const JOB_TYPES = [
  { value: "full-time",  label: "Full-Time" },
  { value: "part-time",  label: "Part-Time" },
  { value: "contract",   label: "Contract" },
  { value: "short-term", label: "Short-Term" },
];

const COUNTRIES = [
  "United States","Canada","United Kingdom","Germany","France","Australia","India",
  "Netherlands","Sweden","Switzerland","Ireland","Singapore","United Arab Emirates",
  "Japan","Brazil","Mexico","Spain","Italy","South Korea","New Zealand","Israel",
  "Poland","Portugal","Belgium","Denmark","Norway","Finland","Austria",
  "Czech Republic","South Africa","Nigeria","Kenya","Egypt","Saudi Arabia",
  "Qatar","China","Philippines","Indonesia","Malaysia","Thailand","Vietnam",
  "Colombia","Argentina","Chile",
];

// ── TagInput ──────────────────────────────────────────────────────────────────
function TagInput({ tags, onChange, placeholder }: { tags: string[]; onChange: (t: string[]) => void; placeholder?: string }) {
  const [input, setInput] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  function add(raw: string) {
    const val = raw.trim().replace(/,+$/, "");
    if (val && !tags.includes(val)) onChange([...tags, val]);
    setInput("");
  }
  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(input); }
    if (e.key === "Backspace" && !input && tags.length) onChange(tags.slice(0, -1));
  }
  return (
    <div
      className="flex min-h-[42px] flex-wrap gap-1.5 rounded-lg border border-gray-300 px-2.5 py-2 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500 cursor-text"
      onClick={() => ref.current?.focus()}
    >
      {tags.map(tag => (
        <span key={tag} className="flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
          {tag}
          <button type="button" onClick={e => { e.stopPropagation(); onChange(tags.filter(t => t !== tag)); }} className="ml-0.5 text-brand-400 hover:text-brand-600">×</button>
        </span>
      ))}
      <input ref={ref} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
        onBlur={() => { if (input.trim()) add(input); }}
        placeholder={tags.length === 0 ? placeholder : ""}
        className="min-w-[120px] flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none" />
    </div>
  );
}

// ── CheckboxGroup ─────────────────────────────────────────────────────────────
function CheckboxGroup({ options, selected, onChange }: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  function toggle(val: string) {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  }
  return (
    <div className="flex flex-wrap gap-3">
      {options.map(opt => (
        <label key={opt.value} className="flex cursor-pointer items-center gap-2 select-none">
          <input
            type="checkbox"
            checked={selected.includes(opt.value)}
            onChange={() => toggle(opt.value)}
            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-sm text-gray-700">{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SearchPreferencesPage() {
  const supabase = createClient();

  const [userId, setUserId]               = useState<string | null>(null);
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [msg, setMsg]                     = useState<Msg | null>(null);

  // — preferences state
  const [currentPosition, setCurrentPosition]   = useState("");
  const [careerLevels, setCareerLevels]         = useState<string[]>([]);
  const [targetRoles, setTargetRoles]           = useState<string[]>([]);
  const [locationCountry, setLocationCountry]   = useState("");
  const [locationState, setLocationState]       = useState("");
  const [locationCity, setLocationCity]         = useState("");
  const [workMode, setWorkMode]                 = useState<string[]>([]);
  const [jobType, setJobType]                   = useState<string[]>([]);
  const [salaryMin, setSalaryMin]               = useState<string>("");
  const [salaryMax, setSalaryMax]               = useState<string>("");
  const [minFitScore, setMinFitScore]           = useState(30);
  const [searchMode, setSearchMode]             = useState("balanced");

  // ── Load preferences ──────────────────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const u = data.user;
        if (!u) return;
        setUserId(u.id);
        const { data: p } = await supabase
          .from("user_profiles")
          .select("current_position,target_roles,career_levels,location_country,location_state,location_city,work_mode,job_type,salary_min,salary_max,min_fit_score,search_mode")
          .eq("user_id", u.id)
          .maybeSingle();
        if (p) {
          setCurrentPosition(p.current_position ?? "");
          setTargetRoles(p.target_roles ?? []);
          setCareerLevels(p.career_levels ?? []);
          setLocationCountry(p.location_country ?? "");
          setLocationState(p.location_state ?? "");
          setLocationCity(p.location_city ?? "");
          setWorkMode(p.work_mode ?? []);
          setJobType(p.job_type ?? []);
          setSalaryMin(p.salary_min != null ? String(p.salary_min) : "");
          setSalaryMax(p.salary_max != null ? String(p.salary_max) : "");
          setMinFitScore(p.min_fit_score ?? 30);
          setSearchMode(p.search_mode ?? "balanced");
        }
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Save preferences ──────────────────────────────────────────────────────
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setSaving(true); setMsg(null);
    try {
      const { error } = await supabase.from("user_profiles").upsert(
        {
          user_id:          userId,
          current_position: currentPosition.trim() || null,
          target_roles:     targetRoles,
          career_levels:    careerLevels,
          location_country: locationCountry || null,
          location_state:   locationState.trim() || null,
          location_city:    locationCity.trim() || null,
          location:         locationCity.trim() || null,
          work_mode:        workMode,
          job_type:         jobType,
          salary_min:       salaryMin ? parseInt(salaryMin, 10) : null,
          salary_max:       salaryMax ? parseInt(salaryMax, 10) : null,
          min_fit_score:    minFitScore,
          search_mode:      searchMode,
          updated_at:       new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (error) throw new Error(error.message);
      setMsg({ type: "success", text: "Preferences saved." });
    } catch (err) {
      setMsg({ type: "error", text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" /></div>;
  }

  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

  return (
    <form onSubmit={e => void handleSave(e)}>
      {/* ── Save bar ──────────────────────────────────────────────────── */}
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-gray-500">Define what jobs you&apos;re looking for so the AI can surface the best matches.</p>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving}
            className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50 transition-colors">
            {saving ? "Saving…" : "Save Preferences"}
          </button>
          {msg && (
            <span className={`text-sm ${msg.type === "success" ? "text-green-600" : "text-red-600"}`}>
              {msg.type === "success" ? "✓ " : "⚠ "}{msg.text}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-8">
        <Section title="Job Targets" subtitle="What roles and level are you targeting?">

          {/* Target Job Titles */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Target Job Titles</label>
            <TagInput tags={targetRoles} onChange={setTargetRoles} placeholder="e.g. VP of Product, Director of Engineering…" />
            <p className="mt-1 text-xs text-gray-400">Press Enter or comma after each title.</p>
          </div>

          {/* Current Position */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Current Position</label>
              <input type="text" value={currentPosition} onChange={e => setCurrentPosition(e.target.value)}
                placeholder="e.g. Senior Product Manager" className={inputCls} />
            </div>
          </div>

          {/* Career Level */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Career Level <span className="text-xs font-normal text-gray-400">(select multiple)</span>
            </label>
            <CheckboxGroup options={CAREER_LEVELS} selected={careerLevels} onChange={setCareerLevels} />
          </div>

        </Section>

        <Section title="Location" subtitle="Where are you open to working?">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-gray-500">Country</label>
              <select value={locationCountry} onChange={e => setLocationCountry(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500">
                <option value="">Select country</option>
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">State / Province</label>
              <input type="text" value={locationState} onChange={e => setLocationState(e.target.value)}
                placeholder="e.g. California" className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">City</label>
              <input type="text" value={locationCity} onChange={e => setLocationCity(e.target.value)}
                placeholder="e.g. San Francisco" className={inputCls} />
            </div>
          </div>
        </Section>

        <Section title="Work Preferences" subtitle="How and how much do you want to work?">

          {/* Work Mode */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Work Mode</label>
            <CheckboxGroup options={WORK_MODES} selected={workMode} onChange={setWorkMode} />
          </div>

          {/* Job Type */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Job Type</label>
            <CheckboxGroup options={JOB_TYPES} selected={jobType} onChange={setJobType} />
          </div>

          {/* Salary Range */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Salary Range</label>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-xs text-gray-500">Minimum</label>
                <input type="number" value={salaryMin} onChange={e => setSalaryMin(e.target.value)}
                  placeholder="e.g. 80000" className={inputCls} />
              </div>
              <div className="mt-4 text-gray-400">—</div>
              <div className="flex-1">
                <label className="mb-1 block text-xs text-gray-500">Maximum</label>
                <input type="number" value={salaryMax} onChange={e => setSalaryMax(e.target.value)}
                  placeholder="e.g. 150000" className={inputCls} />
              </div>
            </div>
          </div>

        </Section>

        <Section title="Match Settings" subtitle="Control how the AI filters and ranks opportunities for you.">

          {/* Min Fit Score */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Minimum Fit Score</label>
              <span className="text-sm font-semibold text-brand-600">{minFitScore}%</span>
            </div>
            <input type="range" min={0} max={100} step={5} value={minFitScore}
              onChange={e => setMinFitScore(Number(e.target.value))}
              className="w-full accent-brand-600" />
            <div className="mt-1 flex justify-between text-xs text-gray-400">
              <span>More Jobs (0%)</span>
              <span>Higher Quality (100%)</span>
            </div>
          </div>

          {/* Search Mode */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Search Mode</label>
            <div className="flex gap-3">
              {[
                { value: "volume",   label: "Volume" },
                { value: "balanced", label: "Balanced" },
                { value: "quality",  label: "Quality" },
              ].map(m => (
                <button key={m.value} type="button" onClick={() => setSearchMode(m.value)}
                  className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                    searchMode === m.value
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-gray-300 bg-white text-gray-600 hover:border-brand-400 hover:text-brand-600"
                  }`}>
                  {m.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-400">
              <strong>Volume</strong> — show everything · <strong>Balanced</strong> — recommended mix · <strong>Quality</strong> — only strong matches
            </p>
          </div>

        </Section>

        {/* ── Save (bottom) ─────────────────────────────────────────── */}
        <div className="flex items-center gap-4 pb-8">
          <button type="submit" disabled={saving}
            className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50 transition-colors">
            {saving ? "Saving…" : "Save Preferences"}
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
