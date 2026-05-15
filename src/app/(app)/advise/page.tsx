import type { Metadata } from "next";
import { AdvisePageInner } from "./AdvisePageInner";

export const metadata: Metadata = { title: "Career Advice — iCareerOS" };

export default function AdvisePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-900">Career Advice</h2>
        <p className="text-sm text-gray-500 mt-1">
          Stage 2 of Career OS. AI-recommended paths, next actions, and a realistic timeline based on your evaluation.
        </p>
      </header>
      <AdvisePageInner />
    </div>
  );
}
