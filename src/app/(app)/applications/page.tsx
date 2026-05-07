import type { Metadata } from "next";
import { Suspense } from "react";
import { ApplicationsPipeline } from "@/components/applications/ApplicationsPipeline";

export const metadata: Metadata = { title: "Pipeline — iCareerOS" };

export default function Page() {
  return (
    <div className="p-6 md:p-10 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">📋 Application pipeline</h1>
        <p className="text-sm text-gray-500">
          Track every role you apply to — status, follow-ups, offers — in one place.
          Each row counts toward the Act stage of your active Career OS cycle.
        </p>
      </div>
      <Suspense
        fallback={<div className="space-y-2">{[...Array(3)].map((_, i) => (<div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />))}</div>}
      >
        <ApplicationsPipeline />
      </Suspense>
    </div>
  );
}
