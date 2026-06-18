import type { Metadata } from "next";
import { CoachPageInner } from "./CoachPageInner";

export const metadata: Metadata = {
  title: "Coach — iCareerOS",
};

export default function CoachPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          Stage 2 · Advise
        </span>
        <h2 className="mt-1 text-2xl font-semibold text-gray-900">Your AI Career Coach</h2>
        <p className="text-sm text-gray-500 mt-1">
          Direct, focused coaching grounded in your actual career data. Context-aware. Career topics only.
        </p>
      </header>
      <CoachPageInner />
    </div>
  );
}
