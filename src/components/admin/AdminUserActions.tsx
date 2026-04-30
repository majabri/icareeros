"use client";

import { useState } from "react";
import { resetUserPlan, confirmUserEmail } from "@/app/actions/adminActions";

interface Props {
  userId: string;
  currentPlan: string;
  email: string;
  emailConfirmed: boolean;
}

export function AdminUserActions({ userId, currentPlan, email, emailConfirmed }: Props) {
  const [loading, setLoading]           = useState<string | null>(null); // tracks which action
  const [planDone, setPlanDone]         = useState(false);
  const [confirmDone, setConfirmDone]   = useState(false);
  const [err, setErr]                   = useState<string | null>(null);

  async function handleReset() {
    if (!confirm(`Reset ${email} to Free plan?`)) return;
    setLoading("plan");
    setErr(null);
    const result = await resetUserPlan(userId);
    setLoading(null);
    if (result.error) setErr(result.error);
    else setPlanDone(true);
  }

  async function handleConfirmEmail() {
    if (!confirm(`Confirm email for ${email}? This will mark their email as verified.`)) return;
    setLoading("confirm");
    setErr(null);
    const result = await confirmUserEmail(userId);
    setLoading(null);
    if (result.error) setErr(result.error);
    else setConfirmDone(true);
  }

  const isEmailConfirmed = emailConfirmed || confirmDone;

  return (
    <span className="flex items-center gap-2 flex-wrap">
      {/* Email confirmation status / action */}
      {isEmailConfirmed ? (
        <span className="text-xs text-green-600 font-medium">✓ Verified</span>
      ) : (
        <button
          onClick={handleConfirmEmail}
          disabled={loading !== null}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50"
        >
          {loading === "confirm" ? "Confirming…" : "Confirm email"}
        </button>
      )}

      {/* Plan reset */}
      {planDone ? (
        <span className="text-xs text-green-600 font-medium">↩ Reset to free</span>
      ) : currentPlan !== "free" ? (
        <button
          onClick={handleReset}
          disabled={loading !== null}
          className="text-xs text-amber-600 hover:text-amber-800 font-medium disabled:opacity-50"
        >
          {loading === "plan" ? "Resetting…" : "Reset plan"}
        </button>
      ) : null}

      {err && <span className="text-xs text-red-500">{err}</span>}
    </span>
  );
}
