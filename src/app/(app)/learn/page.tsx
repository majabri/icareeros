import type { Metadata } from "next";
import { LearnPageInner } from "./LearnPageInner";

export const metadata: Metadata = { title: "Learning Plan — iCareerOS" };

export default function LearnPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-900">Learning Plan</h2>
        <p className="text-sm text-gray-500 mt-1">
          Stage 3 of Career OS. Personalised courses, certifications, and resources to close your skill gaps.
        </p>
      </header>
      <LearnPageInner />
    </div>
  );
}
