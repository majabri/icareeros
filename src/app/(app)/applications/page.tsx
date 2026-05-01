import type { Metadata } from "next";

export const metadata: Metadata = { title: "Pipeline — iCareerOS" };

export default function Page() {
  return (
    <div className="p-6 md:p-10 max-w-2xl">
      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 border border-amber-200 mb-4">
          Coming soon · Week 7
        </span>
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">📋 Pipeline</h1>
        <p className="text-gray-500 text-base leading-relaxed">Track every application in one place — status, follow-up dates, recruiter contacts, and AI-generated next-step suggestions.</p>
      </div>
      <div className="rounded-xl border border-dashed border-gray-300 bg-white px-8 py-14 text-center">
        <p className="text-sm text-gray-400">This feature is under construction. Check back soon.</p>
      </div>
    </div>
  );
}
