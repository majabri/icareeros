import { AdminSystemHealth } from "@/components/admin/AdminSystemHealth";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "System Monitor — iCareerOS Admin" };

export default function AdminSystemPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">System Monitor</h1>
        <p className="mt-1 text-sm text-gray-500">Database record counts, system checks, and agent error log.</p>
      </div>
      <AdminSystemHealth />
    </div>
  );
}
