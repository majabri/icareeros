import type { Metadata } from "next";
import { ActPageInner } from "./ActPageInner";

export const metadata: Metadata = { title: "Action Plan — iCareerOS" };

export default function ActPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-900">Action Plan</h2>
        <p className="text-sm text-gray-500 mt-1">
          Stage 4 of Career OS. AI-generated job-search and networking plan, plus quick links to the tools you'll use.
        </p>
      </header>
      <ActPageInner />
    </div>
  );
}
