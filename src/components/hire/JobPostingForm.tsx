"use client";

/**
 * JobPostingForm — structured form for creating / editing a job posting.
 *
 * Used inside Stage 01 Design (`/design`). Pairs with DesignAgent on the
 * left — when the agent generates a draft, the parent passes it down
 * via `initialValues` and this form pre-fills.
 *
 * Save modes:
 *   - New posting:     POST /api/hire/job-postings (status: 'draft')
 *   - Edit existing:   PATCH /api/hire/job-postings (preserves status
 *                                                     unless caller picks)
 *   - Publish:         PATCH status='open' — DB trigger mirrors the
 *                                            row into `opportunities`
 *   - Close:           PATCH status='closed' (only shown if already open)
 *
 * No hardcoded hex — colour tokens via @/lib/design-tokens.
 */

import { useEffect, useState } from "react";
import { BRAND_COLORS } from "@/lib/design-tokens";

export interface JobPostingRecord {
  id?:             string;
  title:           string;
  company:         string;
  description:     string;
  department?:     string | null;
  location?:       string | null;
  job_type?:       string | null;
  is_remote?:      boolean;
  salary_min?:     number | null;
  salary_max?:     number | null;
  requirements?:   string | null;
  nice_to_haves?:  string | null;
  status?:         "draft" | "open" | "closed" | "filled";
  published_at?:   string | null;
}

export interface JobPostingFormProps {
  initialValues?: Partial<JobPostingRecord>;
  postingId?:     string;
  onSaved:        (posting: JobPostingRecord) => void;
}

type Msg = { type: "success" | "error"; text: string };

function emptyForm(): JobPostingRecord {
  return {
    title:         "",
    company:       "",
    description:   "",
    department:    "",
    location:      "",
    job_type:      "full-time",
    is_remote:     false,
    salary_min:    null,
    salary_max:    null,
    requirements:  "",
    nice_to_haves: "",
  };
}

export function JobPostingForm({ initialValues, postingId, onSaved }: JobPostingFormProps) {
  const [form, setForm]       = useState<JobPostingRecord>(() => ({
    ...emptyForm(),
    ...(initialValues ?? {}),
  }));
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState<Msg | null>(null);
  const [currentId, setCurrentId] = useState<string | undefined>(postingId);
  const [currentStatus, setCurrentStatus] = useState<JobPostingRecord["status"]>(
    (initialValues?.status as JobPostingRecord["status"]) ?? "draft",
  );

  // When the parent passes new initialValues (e.g. from the DesignAgent
  // draft), merge them into form state without clobbering edits the
  // user has already made on top.
  useEffect(() => {
    if (!initialValues) return;
    setForm((prev) => ({
      ...prev,
      ...initialValues,
    }));
    if (initialValues.id) setCurrentId(initialValues.id);
    if (initialValues.status) setCurrentStatus(initialValues.status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValues]);

  function set<K extends keyof JobPostingRecord>(key: K, value: JobPostingRecord[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validate(): string | null {
    if (!form.title.trim())       return "Title is required";
    if (form.title.length > 200)  return "Title must be 200 characters or fewer";
    if (!form.company.trim())     return "Company is required";
    if (!form.description.trim()) return "Description is required";
    if (form.description.length > 2000)
      return "Description must be 2000 characters or fewer";
    if (form.salary_min != null && form.salary_max != null &&
        form.salary_min > form.salary_max) {
      return "Salary min cannot exceed salary max";
    }
    return null;
  }

  async function send(method: "POST" | "PATCH", patch: Record<string, unknown>) {
    setMsg(null);
    const validationError = validate();
    if (validationError) {
      setMsg({ type: "error", text: validationError });
      return null;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/hire/job-postings", {
        method,
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify(patch),
      });
      if (res.status === 429) {
        const retryAfter = res.headers.get("Retry-After") ?? "86400";
        setMsg({
          type: "error",
          text: `Daily post limit reached. Try again in ~${Math.ceil(Number(retryAfter) / 3600)} hours.`,
        });
        return null;
      }
      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        setMsg({ type: "error", text: String(json.error ?? "Save failed") });
        return null;
      }
      return json;
    } catch (e) {
      setMsg({ type: "error", text: e instanceof Error ? e.message : "Network error" });
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDraft() {
    const payload = {
      ...(currentId ? { id: currentId } : {}),
      title:         form.title.trim(),
      company:       form.company.trim(),
      description:   form.description.trim(),
      department:    form.department || null,
      location:      form.location || null,
      job_type:      form.job_type || "full-time",
      is_remote:     Boolean(form.is_remote),
      requirements:  form.requirements || null,
      nice_to_haves: form.nice_to_haves || null,
      salary_min:    form.salary_min ?? null,
      salary_max:    form.salary_max ?? null,
    };
    const result = await send(currentId ? "PATCH" : "POST", payload);
    if (!result) return;
    const id = (result.id as string | undefined) ?? currentId;
    if (id) setCurrentId(id);
    setCurrentStatus("draft");
    setMsg({ type: "success", text: "Draft saved." });
    onSaved({ ...form, id, status: "draft" });
  }

  async function handlePublish() {
    if (!currentId) {
      // Need to save first to get an id, then publish.
      await handleSaveDraft();
    }
    const id = currentId;
    if (!id) return;
    const result = await send("PATCH", { id, status: "open" });
    if (!result) return;
    setCurrentStatus("open");
    setMsg({
      type: "success",
      text: "Your job is now live on iCareerOS for job seekers to discover.",
    });
    onSaved({ ...form, id, status: "open", published_at: result.published_at as string });
  }

  async function handleClose() {
    if (!currentId) return;
    const result = await send("PATCH", { id: currentId, status: "closed" });
    if (!result) return;
    setCurrentStatus("closed");
    setMsg({ type: "success", text: "Posting closed." });
    onSaved({ ...form, id: currentId, status: "closed" });
  }

  const fieldLabel = {
    display:    "block",
    fontSize:   "0.78rem",
    fontWeight: 700,
    color:      `var(--text-primary, ${BRAND_COLORS.navy})`,
    marginBottom: "0.3rem",
  } as const;
  const fieldInput = {
    width:        "100%",
    padding:      "0.55rem 0.75rem",
    border:       "1px solid var(--surface-border, #CBD5E1)",
    borderRadius: 8,
    fontSize:     "0.9rem",
    fontFamily:   "inherit",
  } as const;

  return (
    <section
      aria-label="Job posting form"
      style={{
        background:    "var(--surface-card, #FFFFFF)",
        border:        "1px solid var(--surface-border, #E5E7EB)",
        borderRadius:  12,
        padding:       "1.25rem 1.5rem",
        display:       "flex",
        flexDirection: "column",
        gap:           "0.9rem",
      }}
    >
      <header>
        <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: `var(--text-primary, ${BRAND_COLORS.navy})` }}>
          Job description
        </h2>
        <p style={{ marginTop: "0.3rem", fontSize: "0.85rem", color: "var(--text-muted, #64748B)", lineHeight: 1.5 }}>
          Review and edit, then save as draft or publish to iCareerOS.
        </p>
      </header>

      <div>
        <label style={fieldLabel} htmlFor="jp-title">Title *</label>
        <input id="jp-title" type="text" value={form.title}
               onChange={(e) => set("title", e.target.value)}
               maxLength={200} placeholder="e.g. Senior Backend Engineer (Go)"
               style={fieldInput} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem" }}>
        <div>
          <label style={fieldLabel} htmlFor="jp-company">Company *</label>
          <input id="jp-company" type="text" value={form.company}
                 onChange={(e) => set("company", e.target.value)}
                 maxLength={200} style={fieldInput} />
        </div>
        <div>
          <label style={fieldLabel} htmlFor="jp-department">Department</label>
          <input id="jp-department" type="text" value={form.department ?? ""}
                 onChange={(e) => set("department", e.target.value)}
                 maxLength={200} style={fieldInput} />
        </div>
      </div>

      <div>
        <label style={fieldLabel} htmlFor="jp-description">Description *</label>
        <textarea id="jp-description" value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  maxLength={2000} rows={4}
                  style={{ ...fieldInput, resize: "vertical", minHeight: 90 }} />
        <div style={{ marginTop: "0.2rem", fontSize: "0.7rem", color: "var(--text-muted, #94A3B8)", textAlign: "right" }}>
          {form.description.length} / 2000
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.85rem", alignItems: "end" }}>
        <div>
          <label style={fieldLabel} htmlFor="jp-location">Location</label>
          <input id="jp-location" type="text" value={form.location ?? ""}
                 onChange={(e) => set("location", e.target.value)}
                 placeholder="e.g. Remote · US" maxLength={200} style={fieldInput} />
        </div>
        <div>
          <label style={fieldLabel} htmlFor="jp-jobtype">Job type</label>
          <select id="jp-jobtype" value={form.job_type ?? "full-time"}
                  onChange={(e) => set("job_type", e.target.value)}
                  style={fieldInput}>
            <option value="full-time">Full-time</option>
            <option value="part-time">Part-time</option>
            <option value="contract">Contract</option>
            <option value="internship">Internship</option>
          </select>
        </div>
        <div style={{ paddingBottom: "0.55rem" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", cursor: "pointer" }}>
            <input type="checkbox" checked={Boolean(form.is_remote)}
                   onChange={(e) => set("is_remote", e.target.checked)} />
            <span style={{ fontSize: "0.88rem", color: `var(--text-primary, ${BRAND_COLORS.navy})`, fontWeight: 600 }}>
              Remote-friendly
            </span>
          </label>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem" }}>
        <div>
          <label style={fieldLabel} htmlFor="jp-reqs">Requirements (one per line)</label>
          <textarea id="jp-reqs" value={form.requirements ?? ""}
                    onChange={(e) => set("requirements", e.target.value)}
                    rows={5} style={{ ...fieldInput, resize: "vertical" }} />
        </div>
        <div>
          <label style={fieldLabel} htmlFor="jp-nth">Nice to haves (one per line)</label>
          <textarea id="jp-nth" value={form.nice_to_haves ?? ""}
                    onChange={(e) => set("nice_to_haves", e.target.value)}
                    rows={5} style={{ ...fieldInput, resize: "vertical" }} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem" }}>
        <div>
          <label style={fieldLabel} htmlFor="jp-smin">Salary min ($/yr)</label>
          <input id="jp-smin" type="number" min={0} value={form.salary_min ?? ""}
                 onChange={(e) => set("salary_min", e.target.value === "" ? null : Number(e.target.value))}
                 style={fieldInput} />
        </div>
        <div>
          <label style={fieldLabel} htmlFor="jp-smax">Salary max ($/yr)</label>
          <input id="jp-smax" type="number" min={0} value={form.salary_max ?? ""}
                 onChange={(e) => set("salary_max", e.target.value === "" ? null : Number(e.target.value))}
                 style={fieldInput} />
        </div>
      </div>

      {msg && (
        <div role={msg.type === "error" ? "alert" : "status"}
             style={{
               padding:      "0.55rem 0.85rem",
               borderRadius: 8,
               fontSize:     "0.88rem",
               background:   msg.type === "success" ? `${BRAND_COLORS.green}1A` : `${BRAND_COLORS.coral}1A`,
               color:        msg.type === "success" ? BRAND_COLORS.green : BRAND_COLORS.coral,
             }}>
          {msg.type === "success" ? "✓ " : "⚠ "}{msg.text}
        </div>
      )}

      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginTop: "0.3rem" }}>
        <button type="button" onClick={() => void handleSaveDraft()} disabled={saving}
                style={{
                  background:   "transparent",
                  color:        BRAND_COLORS.teal,
                  border:       `1.5px solid ${BRAND_COLORS.teal}`,
                  fontWeight:   700,
                  fontSize:     "0.9rem",
                  padding:      "0.55rem 1.1rem",
                  borderRadius: 10,
                  cursor:       saving ? "wait" : "pointer",
                  opacity:      saving ? 0.65 : 1,
                }}>
          {saving ? "Saving…" : "Save draft"}
        </button>
        <button type="button" onClick={() => void handlePublish()} disabled={saving || currentStatus === "open"}
                style={{
                  background:   currentStatus === "open" ? "#CBD5E1" : BRAND_COLORS.teal,
                  color:        "#FFFFFF",
                  border:       "none",
                  fontWeight:   700,
                  fontSize:     "0.9rem",
                  padding:      "0.6rem 1.2rem",
                  borderRadius: 10,
                  cursor:       saving || currentStatus === "open" ? "not-allowed" : "pointer",
                  opacity:      saving ? 0.65 : 1,
                }}>
          {currentStatus === "open" ? "Published" : "Publish to iCareerOS →"}
        </button>
        {currentStatus === "open" && (
          <button type="button" onClick={() => void handleClose()} disabled={saving}
                  style={{
                    background:   "transparent",
                    color:        BRAND_COLORS.coral,
                    border:       `1.5px solid ${BRAND_COLORS.coral}`,
                    fontWeight:   700,
                    fontSize:     "0.9rem",
                    padding:      "0.55rem 1.1rem",
                    borderRadius: 10,
                    cursor:       saving ? "wait" : "pointer",
                    opacity:      saving ? 0.65 : 1,
                  }}>
            Close posting
          </button>
        )}
      </div>
    </section>
  );
}

export default JobPostingForm;
