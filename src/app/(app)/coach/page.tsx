import type { Metadata } from "next";
import { CoachPageInner } from "./CoachPageInner";

export const metadata: Metadata = {
  title: "Coach — iCareerOS",
};

export default function CoachPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-900">Your AI Career Coach</h2>
        <p className="text-sm text-gray-500 mt-1">
          Direct, focused coaching grounded in your actual career data. Context-aware. Career topics only.
        </p>
      </header>
      <CoachPageInner />
    </div>
  );
}
