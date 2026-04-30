"use client";

import { useState } from "react";
import { resetUserPlan } from "@/app/actions/adminActions";

interface Props {
  userId: string;
  currentPlan: string;
  email: string;
}

export function AdminUserActions({ userId, currentPlan, email }: Props) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleReset() {
    if (!confirm(`Reset ${email} to Free plan?`)) return;
    setLoading(true);
    setErr(null);
    const result = await resetUserPlan(userId);
    setLoading(false);
    if (result.error) {
      setErr(result.error);
    } else {
      setDone(true);
    }
  }

  if (done) {
    return <span className="text-xs text-green-600 font-medium">↩ Reset to free</span>;
  }

  return (
    <span className="flex items-center gap-2">
      {currentPlan !== "free" && (
        <button
          onClick={handleReset}
          disabled={loading}
          className="text-xs text-amber-600 hover:text-amber-800 font-medium disabled:opacity-50"
        >
          {loading ? "Resetting…" : "Reset plan"}
        </button>
      )}
      {err && <span className="text-xs text-red-500">{err}</span>}
    </span>
  );
}
