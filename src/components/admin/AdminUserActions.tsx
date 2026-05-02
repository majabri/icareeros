"use client";

import { useState } from "react";
import { setUserPlan, setUserRole, confirmUserEmail, deleteUser } from "@/app/actions/adminActions";
import type { UserRole, SubscriptionPlan } from "@/app/actions/adminActions";

interface Props {
  userId: string;
  currentPlan: SubscriptionPlan;
  currentRole: UserRole;
  email: string;
  emailConfirmed: boolean;
}

const PLAN_OPTIONS: { value: SubscriptionPlan; label: string; color: string }[] = [
  { value: "free",    label: "Free",    color: "text-gray-600" },
  { value: "pro",     label: "Pro",     color: "text-blue-600" },
  { value: "premium", label: "Premium", color: "text-purple-600" },
];

const ROLE_OPTIONS: { value: UserRole; label: string; color: string }[] = [
  { value: "user",      label: "User",      color: "text-gray-600" },
  { value: "moderator", label: "Moderator", color: "text-amber-600" },
  { value: "admin",     label: "Admin",     color: "text-red-600" },
];

export function AdminUserActions({ userId, currentPlan, currentRole, email, emailConfirmed }: Props) {
  const [plan, setPlan]               = useState<SubscriptionPlan>(currentPlan);
  const [role, setRole]               = useState<UserRole>(currentRole);
  const [savingPlan, setSavingPlan]   = useState(false);
  const [savingRole, setSavingRole]   = useState(false);
  const [confirmingEmail, setConfirmingEmail] = useState(false);
  const [deleting, setDeleting]       = useState(false);
  const [emailDone, setEmailDone]     = useState(emailConfirmed);
  const [err, setErr]                 = useState<string | null>(null);

  async function handlePlanChange(next: SubscriptionPlan) {
    if (next === plan) return;
    if (!confirm(`Change ${email} from ${plan} → ${next}?`)) return;
    setSavingPlan(true);
    setErr(null);
    const res = await setUserPlan(userId, next);
    setSavingPlan(false);
    if (res.error) setErr(res.error);
    else setPlan(next);
  }

  async function handleRoleChange(next: UserRole) {
    if (next === role) return;
    if (!confirm(`Change ${email} role from ${role} → ${next}?`)) return;
    setSavingRole(true);
    setErr(null);
    const res = await setUserRole(userId, next);
    setSavingRole(false);
    if (res.error) setErr(res.error);
    else setRole(next);
  }

  async function handleConfirmEmail() {
    if (!confirm(`Mark ${email} as email-verified?`)) return;
    setConfirmingEmail(true);
    setErr(null);
    const res = await confirmUserEmail(userId);
    setConfirmingEmail(false);
    if (res.error) setErr(res.error);
    else setEmailDone(true);
  }

  async function handleDelete() {
    if (!confirm(
      "⚠️  Permanently delete " + email + "?\n\n" +
      "This removes the user account, subscription, profile, cycles, and all related data. " +
      "It cannot be undone.\n\n" +
      "Click OK to confirm."
    )) return;
    setDeleting(true);
    setErr(null);
    const res = await deleteUser(userId);
    setDeleting(false);
    if (res.error) setErr(res.error);
    // On success the row disappears via revalidatePath in the server action.
  }

  const planColor = PLAN_OPTIONS.find(p => p.value === plan)?.color ?? "text-gray-600";
  const roleColor = ROLE_OPTIONS.find(r => r.value === role)?.color ?? "text-gray-600";

  return (
    <span className="flex items-center gap-2 flex-wrap">

      {/* Plan selector */}
      <span className="relative inline-flex items-center">
        <select
          value={plan}
          onChange={e => handlePlanChange(e.target.value as SubscriptionPlan)}
          disabled={savingPlan}
          className={`text-xs font-medium border border-gray-200 rounded px-1.5 py-0.5 bg-white
                      cursor-pointer hover:border-gray-300 focus:outline-none focus:ring-1
                      focus:ring-blue-400 disabled:opacity-50 ${planColor}`}
          title="Change subscription plan"
        >
          {PLAN_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {savingPlan && <span className="ml-1 text-xs text-gray-400">…</span>}
      </span>

      {/* Role selector */}
      <span className="relative inline-flex items-center">
        <select
          value={role}
          onChange={e => handleRoleChange(e.target.value as UserRole)}
          disabled={savingRole}
          className={`text-xs font-medium border border-gray-200 rounded px-1.5 py-0.5 bg-white
                      cursor-pointer hover:border-gray-300 focus:outline-none focus:ring-1
                      focus:ring-blue-400 disabled:opacity-50 ${roleColor}`}
          title="Change user role"
        >
          {ROLE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {savingRole && <span className="ml-1 text-xs text-gray-400">…</span>}
      </span>

      {/* Email confirmation */}
      {emailDone ? (
        <span className="text-xs text-green-600 font-medium">✓ Verified</span>
      ) : (
        <button
          onClick={handleConfirmEmail}
          disabled={confirmingEmail}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50"
        >
          {confirmingEmail ? "Confirming…" : "Confirm email"}
        </button>
      )}

      {err && <span className="text-xs text-red-500">{err}</span>}

      {/* Delete user (destructive — self-delete blocked at server) */}
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-50 ml-1"
        title="Permanently delete this user"
      >
        {deleting ? "Deleting…" : "Delete"}
      </button>
    </span>
  );
}
