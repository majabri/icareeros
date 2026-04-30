import { AdminCommandConsole } from "@/components/admin/AdminCommandConsole";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Admin Console — iCareerOS Admin" };

export default function AdminConsolePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Admin Console</h1>
        <p className="mt-1 text-sm text-gray-500">
          Run privileged commands. Type <code className="bg-gray-100 px-1 rounded text-xs">help</code> for available commands.
        </p>
      </div>
      <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
        ⚠ Commands run with service-role privileges. Double-check arguments before executing.
      </div>
      <AdminCommandConsole />
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Command Reference</h2>
        <div className="divide-y divide-gray-100">
          {[
            { cmd: "agent.retry <run_id>",         desc: "Retry a failed agent run by ID" },
            { cmd: "agent.run <user_id>",           desc: "Trigger a new agent run for a user" },
            { cmd: "queue.clear",                   desc: "Clear the job processing queue" },
            { cmd: "queue.stats",                   desc: "Show queue statistics and depth" },
            { cmd: "user.disable <user_id>",        desc: "Disable a user account" },
            { cmd: "user.promote <user_id> <plan>", desc: "Promote user to pro or premium" },
            { cmd: "system.health",                 desc: "Run a system health check" },
          ].map(({ cmd, desc }) => (
            <div key={cmd} className="flex gap-4 py-2">
              <code className="text-xs font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded flex-shrink-0">{cmd}</code>
              <span className="text-xs text-gray-500">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
