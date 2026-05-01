"use client";

import { useState, useCallback } from "react";
import {
  createOffer,
  listOffers,
  updateOfferStatus,
  deleteOffer,
  analyzeNegotiation,
  type JobOffer,
  type OfferStatus,
  type NegotiationResult,
  type CreateOfferInput,
} from "@/services/ai/offerDeskService";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<OfferStatus, { label: string; color: string }> = {
  received:    { label: "Received",    color: "bg-brand-100 text-brand-700" },
  negotiating: { label: "Negotiating", color: "bg-amber-100 text-amber-700" },
  accepted:    { label: "Accepted",    color: "bg-emerald-100 text-emerald-700" },
  declined:    { label: "Declined",    color: "bg-red-100 text-red-700" },
};

function fmt(n: number | null | undefined) {
  if (!n) return null;
  return `$${Number(n).toLocaleString()}`;
}

// ── Add Offer Form ────────────────────────────────────────────────────────────

function AddOfferForm({ onAdd, onCancel }: { onAdd: (input: CreateOfferInput) => Promise<void>; onCancel: () => void }) {
  const [form, setForm] = useState<CreateOfferInput>({ company: "", role_title: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (field: keyof CreateOfferInput, value: string | number | undefined) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async () => {
    if (!form.company.trim() || !form.role_title.trim()) {
      setErr("Company and role title are required.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await onAdd(form);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-5">
      <h3 className="mb-4 font-semibold text-gray-900">Add New Offer</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Company *</label>
          <input type="text" value={form.company} onChange={(e) => set("company", e.target.value)}
            placeholder="e.g. Google" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Role Title *</label>
          <input type="text" value={form.role_title} onChange={(e) => set("role_title", e.target.value)}
            placeholder="e.g. Senior Software Engineer" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Base Salary ($)</label>
          <input type="number" value={form.base_salary ?? ""} onChange={(e) => set("base_salary", e.target.value ? Number(e.target.value) : undefined)}
            placeholder="150000" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Total Comp ($)</label>
          <input type="number" value={form.total_comp ?? ""} onChange={(e) => set("total_comp", e.target.value ? Number(e.target.value) : undefined)}
            placeholder="200000" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Equity</label>
          <input type="text" value={form.equity ?? ""} onChange={(e) => set("equity", e.target.value || undefined)}
            placeholder="e.g. 10,000 RSUs over 4 years" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Bonus</label>
          <input type="text" value={form.bonus ?? ""} onChange={(e) => set("bonus", e.target.value || undefined)}
            placeholder="e.g. 15% annual target" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Deadline</label>
          <input type="date" value={form.deadline ?? ""} onChange={(e) => set("deadline", e.target.value || undefined)}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Benefits</label>
          <input type="text" value={form.benefits ?? ""} onChange={(e) => set("benefits", e.target.value || undefined)}
            placeholder="e.g. Full medical, 401k 6%, remote" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none" />
        </div>
      </div>
      <div className="mt-3">
        <label className="mb-1 block text-xs font-medium text-gray-600">Notes</label>
        <textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value || undefined)}
          rows={2} placeholder="Any context about the offer, your leverage, or priorities…"
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none" />
      </div>
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
      <div className="mt-4 flex gap-3">
        <button onClick={onCancel} className="flex-1 rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
        <button onClick={() => void handleSubmit()} disabled={saving}
          className="flex-1 rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
          {saving ? "Saving…" : "Add Offer"}
        </button>
      </div>
    </div>
  );
}

// ── Negotiation Panel ─────────────────────────────────────────────────────────

function NegotiationPanel({ result, offer }: { result: NegotiationResult; offer: JobOffer }) {
  const [copyMsg, setCopyMsg] = useState<string | null>(null);

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(result.emailTemplate);
      setCopyMsg("Copied!");
      setTimeout(() => setCopyMsg(null), 2000);
    } catch {
      setCopyMsg("Copy failed");
    }
  };

  const riskColor = {
    low: "text-emerald-600 bg-emerald-50",
    medium: "text-amber-600 bg-amber-50",
    high: "text-red-600 bg-red-50",
  }[result.riskLevel];

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Strategy</p>
          <p className="text-sm text-gray-700 leading-relaxed">{result.strategy}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${riskColor}`}>
          {result.riskLevel.toUpperCase()} RISK
        </span>
      </div>

      {result.counterOfferRange && (
        <div className="rounded-lg bg-white p-4 border border-gray-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Counter-Offer Range</p>
          <div className="flex items-center gap-3">
            <div className="text-center">
              <p className="text-xs text-gray-400">Conservative</p>
              <p className="text-lg font-bold text-gray-900">${result.counterOfferRange.low.toLocaleString()}</p>
            </div>
            <div className="flex-1 text-center text-gray-300">—</div>
            <div className="text-center">
              <p className="text-xs text-gray-400">Aggressive</p>
              <p className="text-lg font-bold text-brand-600">${result.counterOfferRange.high.toLocaleString()}</p>
            </div>
          </div>
          {offer.base_salary && (
            <p className="mt-2 text-xs text-gray-400 text-center">
              vs. current offer: ${Number(offer.base_salary).toLocaleString()}
              {" "}(+{Math.round(((result.counterOfferRange.low / Number(offer.base_salary)) - 1) * 100)}% – +{Math.round(((result.counterOfferRange.high / Number(offer.base_salary)) - 1) * 100)}%)
            </p>
          )}
        </div>
      )}

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Talking Points</p>
        <ul className="space-y-2">
          {result.talkingPoints.map((tp, i) => (
            <li key={i} className="flex gap-2 text-sm text-gray-700">
              <span className="mt-0.5 text-emerald-500 shrink-0">✓</span>
              <span>{tp}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Email Template</p>
          <button onClick={() => void copyEmail()} className="text-xs text-brand-600 hover:text-brand-800">
            {copyMsg ?? "Copy"}
          </button>
        </div>
        <pre className="rounded-lg bg-white border border-gray-200 p-4 text-xs text-gray-700 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
          {result.emailTemplate}
        </pre>
      </div>
    </div>
  );
}

// ── Offer Card ────────────────────────────────────────────────────────────────

function OfferCard({
  offer,
  onStatusChange,
  onDelete,
  onAnalyze,
  analyzing,
}: {
  offer: JobOffer;
  onStatusChange: (id: string, status: OfferStatus) => void;
  onDelete: (id: string) => void;
  onAnalyze: (offer: JobOffer) => void;
  analyzing: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[offer.status];

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-gray-900">{offer.company}</h3>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
            </div>
            <p className="text-sm text-gray-500">{offer.role_title}</p>
          </div>
          <div className="text-right shrink-0">
            {fmt(offer.base_salary) && <p className="font-bold text-gray-900">{fmt(offer.base_salary)}</p>}
            {fmt(offer.total_comp) && <p className="text-xs text-gray-400">Total: {fmt(offer.total_comp)}</p>}
          </div>
        </div>

        {/* Details row */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
          {offer.equity && <span>📈 {offer.equity}</span>}
          {offer.bonus && <span>💰 {offer.bonus}</span>}
          {offer.deadline && <span>📅 Deadline: {new Date(offer.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>}
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => onAnalyze(offer)}
            disabled={analyzing}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {analyzing ? "Analyzing…" : "🤝 Negotiate"}
          </button>
          <select
            value={offer.status}
            onChange={(e) => onStatusChange(offer.id, e.target.value as OfferStatus)}
            className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-700 focus:outline-none"
          >
            <option value="received">Received</option>
            <option value="negotiating">Negotiating</option>
            <option value="accepted">Accepted</option>
            <option value="declined">Declined</option>
          </select>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
          >
            {expanded ? "Hide ↑" : "Details ↓"}
          </button>
          <button onClick={() => onDelete(offer.id)} className="rounded-lg px-3 py-1.5 text-xs text-red-500 hover:bg-red-50">
            Delete
          </button>
        </div>

        {/* Expanded details */}
        {expanded && (
          <div className="mt-4 space-y-2 text-sm text-gray-600">
            {offer.benefits && <p><span className="font-medium text-gray-700">Benefits:</span> {offer.benefits}</p>}
            {offer.notes && <p><span className="font-medium text-gray-700">Notes:</span> {offer.notes}</p>}
          </div>
        )}
      </div>

      {/* Negotiation result */}
      {offer.negotiation_result && (
        <div className="border-t border-gray-100 px-5 pb-5">
          <NegotiationPanel result={offer.negotiation_result} offer={offer} />
        </div>
      )}
    </div>
  );
}

// ── Negotiation Options Modal ──────────────────────────────────────────────────

function NegotiateModal({
  offer,
  onAnalyze,
  onClose,
  analyzing,
}: {
  offer: JobOffer;
  onAnalyze: (targetSalary?: number, priorities?: string[]) => void;
  onClose: () => void;
  analyzing: boolean;
}) {
  const [targetSalary, setTargetSalary] = useState("");
  const PRIORITIES = ["Higher base salary", "More equity", "Signing bonus", "Remote flexibility", "More PTO", "Faster promotion timeline"];
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (p: string) => setSelected((s) => s.includes(p) ? s.filter((x) => x !== p) : [...s, p]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="mb-1 text-lg font-bold text-gray-900">Negotiate Offer</h3>
        <p className="mb-4 text-sm text-gray-500">{offer.company} — {offer.role_title}</p>

        <label className="mb-1 block text-sm font-medium text-gray-700">
          Target salary <span className="text-gray-400">(optional)</span>
        </label>
        <input
          type="number"
          value={targetSalary}
          onChange={(e) => setTargetSalary(e.target.value)}
          placeholder={offer.base_salary ? `Current: $${Number(offer.base_salary).toLocaleString()}` : "e.g. 175000"}
          className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        />

        <p className="mb-2 text-sm font-medium text-gray-700">Priorities</p>
        <div className="mb-6 flex flex-wrap gap-2">
          {PRIORITIES.map((p) => (
            <button
              key={p}
              onClick={() => toggle(p)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${selected.includes(p) ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
          <button
            onClick={() => onAnalyze(targetSalary ? Number(targetSalary) : undefined, selected.length ? selected : undefined)}
            disabled={analyzing}
            className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {analyzing ? "Analyzing…" : "Generate Strategy"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function OffersPage() {
  const [offers, setOffers] = useState<JobOffer[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const [negotiatingOffer, setNegotiatingOffer] = useState<JobOffer | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  const loadOffers = useCallback(async () => {
    try {
      const data = await listOffers();
      setOffers(data);
      setLoaded(true);
    } catch (e) {
      console.error("Failed to load offers", e);
    }
  }, []);

  useState(() => { void loadOffers(); });

  const handleAdd = useCallback(async (input: CreateOfferInput) => {
    const offer = await createOffer(input);
    setOffers((prev) => [offer, ...prev]);
    setShowAddForm(false);
  }, []);

  const handleStatusChange = useCallback(async (id: string, status: OfferStatus) => {
    try {
      await updateOfferStatus(id, status);
      setOffers((prev) => prev.map((o) => o.id === id ? { ...o, status } : o));
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "Update failed");
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteOffer(id);
      setOffers((prev) => prev.filter((o) => o.id !== id));
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "Delete failed");
    }
  }, []);

  const handleAnalyze = useCallback(async (
    offer: JobOffer,
    targetSalary?: number,
    priorities?: string[]
  ) => {
    setAnalyzingId(offer.id);
    setNegotiatingOffer(null);
    setPageError(null);
    try {
      const result = await analyzeNegotiation({
        offerId: offer.id,
        targetSalary,
        priorities,
      });
      setOffers((prev) =>
        prev.map((o) =>
          o.id === offer.id ? { ...o, negotiation_result: result, status: "negotiating" } : o
        )
      );
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAnalyzingId(null);
    }
  }, []);

  const activeCount = offers.filter((o) => o.status === "received" || o.status === "negotiating").length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">🤝 Offer Desk</h1>
            <p className="mt-1 text-sm text-gray-500">
              Track offers and get AI-powered negotiation strategies.
              {activeCount > 0 && <span className="ml-2 font-medium text-brand-600">{activeCount} active</span>}
            </p>
          </div>
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            + Add Offer
          </button>
        </div>

        {/* Add form */}
        {showAddForm && (
          <div className="mb-6">
            <AddOfferForm onAdd={handleAdd} onCancel={() => setShowAddForm(false)} />
          </div>
        )}

        {/* Error */}
        {pageError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {pageError}
          </div>
        )}

        {/* Offers list */}
        {loaded && (
          <div className="space-y-4">
            {offers.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-gray-200 p-12 text-center">
                <p className="text-3xl mb-3">🤝</p>
                <p className="font-medium text-gray-700">No offers yet</p>
                <p className="mt-1 text-sm text-gray-400">Add your first job offer to get started.</p>
                <button onClick={() => setShowAddForm(true)} className="mt-4 rounded-xl bg-brand-600 px-6 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                  Add First Offer
                </button>
              </div>
            ) : (
              offers.map((offer) => (
                <OfferCard
                  key={offer.id}
                  offer={offer}
                  onStatusChange={(id, status) => void handleStatusChange(id, status)}
                  onDelete={(id) => void handleDelete(id)}
                  onAnalyze={(o) => setNegotiatingOffer(o)}
                  analyzing={analyzingId === offer.id}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* Negotiate modal */}
      {negotiatingOffer && (
        <NegotiateModal
          offer={negotiatingOffer}
          analyzing={analyzingId === negotiatingOffer.id}
          onClose={() => setNegotiatingOffer(null)}
          onAnalyze={(targetSalary, priorities) =>
            void handleAnalyze(negotiatingOffer, targetSalary, priorities)
          }
        />
      )}
    </div>
  );
}
