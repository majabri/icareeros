import type { Metadata } from "next";
import { AchievePageInner } from "./AchievePageInner";

export const metadata: Metadata = { title: "Achieve — iCareerOS" };

export default function AchievePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-900">Achieve</h2>
        <p className="text-sm text-gray-500 mt-1">
          Stage 6 of Career OS. Record this cycle's milestone, capture accomplishments, plan the next cycle.
        </p>
      </header>
      <AchievePageInner />
    </div>
  );
}
