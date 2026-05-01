"use client";

import { useState } from "react";
import { analyseJobDescription, type RecruiterAnalysis } from "@/services/recruiterService";
import type { Metadata } from "next";

// Note: metadata export is not used in client components but kept for reference
// export const metadata: Metadata = { title: "Recruiter Assistant — iCareerOS" };

export default function RecruiterPage() {
  const [companyName, setCompanyName] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RecruiterAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyse() {
    if (jobDescription.trim().length < 50) return;
    setLoading(true);
    setError(null);
    setResult(null);
    const res = await analyseJobDescription(jobDescription, companyName || undefined);
    setLoading(false);
    if (res.error) {
      setError(res.error);
    } else if (res.analysis) {
      setResult(res.analysis);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Recruiter Assistant</h1>
        <p className="mt-1 text-sm text-gray-500">
          Paste a job description and get an instant candidate profile, screening questions, and red-flag signals.
        </p>
      </div>

      {/* Input card */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Company name <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={companyName}
            onChange={e => setCompanyName(e.target.value)}
            placeholder="Acme Corp"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Job description <span className="text-red-400">*</span>
          </label>
          <textarea
            value={jobDescription}
            onChange={e => setJobDescription(e.target.value)}
            rows={10}
            placeholder="Paste the full job description here…"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
          />
          <p className="mt-1 text-xs text-gray-400">{jobDescription.length} chars (min 50)</p>
        </div>
        <button
          onClick={handleAnalyse}
          disabled={loading || jobDescription.trim().length < 50}
          className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Analysing…" : "Analyse Job Description"}
        </button>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      {/* Results */}
      {result && (
        <div className="mt-8 space-y-6">
          {/* Ideal candidate */}
          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-gray-800">🎯 Ideal Candidate</h2>
            <p className="text-sm text-gray-700 leading-relaxed">{result.ideal_candidate}</p>
          </section>

          {/* Skills split */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <section className="rounded-2xl border border-green-100 bg-green-50 p-6 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-green-800">✅ Must-Have Skills</h2>
              <ul className="space-y-1">
                {result.must_have_skills.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-green-700">
                    <span className="mt-0.5 flex-shrink-0">•</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="rounded-2xl border border-brand-100 bg-brand-50 p-6 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-brand-800">💡 Nice-to-Have Skills</h2>
              <ul className="space-y-1">
                {result.nice_to_have_skills.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-brand-700">
                    <span className="mt-0.5 flex-shrink-0">•</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* Screening questions */}
          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-gray-800">💬 Screening Questions</h2>
            <ol className="space-y-5">
              {result.screening_questions.map((q, i) => (
                <li key={i} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                  <p className="text-sm font-medium text-gray-900">
                    {i + 1}. {q.question}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    <span className="font-medium text-gray-600">Listen for:</span> {q.what_to_listen_for}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          {/* Red flags */}
          <section className="rounded-2xl border border-red-100 bg-red-50 p-6 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-red-800">🚩 Red-Flag Signals</h2>
            <ul className="space-y-1">
              {result.red_flags.map((flag, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-red-700">
                  <span className="mt-0.5 flex-shrink-0">•</span>
                  <span>{flag}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Compensation notes */}
          {result.compensation_notes && (
            <section className="rounded-2xl border border-amber-100 bg-amber-50 p-4 shadow-sm">
              <p className="text-sm text-amber-800">
                <span className="font-medium">💰 Compensation:</span> {result.compensation_notes}
              </p>
            </section>
          )}

          {/* Reset */}
          <button
            onClick={() => { setResult(null); setJobDescription(""); setCompanyName(""); }}
            className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Analyse another role
          </button>
        </div>
      )}
    </div>
  );
}
