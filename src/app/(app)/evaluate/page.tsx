import type { Metadata } from "next";
import { EvaluatePageInner } from "./EvaluatePageInner";

export const metadata: Metadata = { title: "Evaluate — iCareerOS" };

export default function EvaluatePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-900">Evaluate</h2>
        <p className="text-sm text-gray-500 mt-1">
          Stage 1 of Career OS. AI-assesses your current skills, gaps, market fit, and recommends the next step.
        </p>
      </header>
      <EvaluatePageInner />
    </div>
  );
}
