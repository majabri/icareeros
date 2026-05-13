import { AdminSystemHealth } from "@/components/admin/AdminSystemHealth";
import { AdminDeployHistory } from "@/components/admin/AdminDeployHistory";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "System Monitor — iCareerOS Admin" };

export default function AdminSystemPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">System Monitor</h1>
        <p className="mt-1 text-sm text-gray-500">
          Database record counts, system checks, deploy history (ADR-005 Phase 2), and agent error log.
        </p>
      </div>
      <AdminSystemHealth />
      <AdminDeployHistory />
    </div>
  );
}
