/**
 * /settings/security — Security & Compliance
 * Password change, data export, account deletion
 */
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { triggerDataExport, deleteAccount } from "@/services/accountService";

type Msg        = { type: "success" | "error"; text: string };
type ModalState = "closed" | "confirm" | "deleting" | "error";

function StatusBanner({ msg }: { msg: Msg | null }) {
  if (!msg) return null;
  return (
    <div className={`rounded-lg border px-4 py-2.5 text-sm ${
      msg.type === "success"
        ? "border-green-200 bg-green-50 text-green-700"
        : "border-red-200 bg-red-50 text-red-700"
    }`}>
      {msg.type === "success" ? "✓ " : "⚠ "}{msg.text}
    </div>
  );
}

export default function SecurityPage() {
  const supabase = createClient();

  const [newPassword, setNewPassword]         = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving]               = useState(false);
  const [pwMsg, setPwMsg]                     = useState<Msg | null>(null);

  const [exporting, setExporting]             = useState(false);
  const [modal, setModal]                     = useState<ModalState>("closed");
  const [confirmText, setConfirmText]         = useState("");
  const [deleteError, setDeleteError]         = useState<string | null>(null);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    if (newPassword.length < 8) {
      setPwMsg({ type: "error", text: "Password must be at least 8 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwMsg({ type: "error", text: "Passwords do not match." });
      return;
    }
    setPwSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw new Error(error.message);
      setNewPassword("");
      setConfirmPassword("");
      setPwMsg({ type: "success", text: "Password updated." });
    } catch (err) {
      setPwMsg({ type: "error", text: (err as Error).message });
    } finally {
      setPwSaving(false);
    }
  }

  function handleExport() {
    setExporting(true);
    triggerDataExport();
    setTimeout(() => setExporting(false), 2000);
  }

  async function handleDelete() {
    if (confirmText !== "DELETE") return;
    setModal("deleting");
    setDeleteError(null);
    try {
      await deleteAccount();
      window.location.href = "/auth/login?deleted=1";
    } catch (e) {
      setDeleteError((e as Error).message);
      setModal("error");
    }
  }

  function openModal()  { setConfirmText(""); setDeleteError(null); setModal("confirm"); }
  function closeModal() { setModal("closed"); setConfirmText(""); setDeleteError(null); }

  return (
    <div className="space-y-8">

      {/* ── Security ──────────────────────────────────────────────── */}
      <form onSubmit={handleChangePassword}>
        <section className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Security</h2>
            <p className="mt-1 text-sm text-gray-500">
              Set a new password. If you signed in with Google or Apple, use this to add a password.
            </p>
          </div>
          <div className="max-w-sm space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">New password</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters" autoComplete="new-password"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Confirm password</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password" autoComplete="new-password"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
          </div>
          <StatusBanner msg={pwMsg} />
          <button type="submit" disabled={pwSaving || !newPassword || !confirmPassword}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors">
            {pwSaving ? "Updating…" : "Update password"}
          </button>
        </section>
      </form>

      {/* ── Your data ─────────────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-base font-semibold text-gray-900">Your data</h2>
        <p className="mb-4 text-sm text-gray-500">
          Download a copy of all your iCareerOS data — career cycles, resumes, offers, job alerts,
          support tickets, and email preferences — as a single JSON file.
        </p>
        <button onClick={handleExport} disabled={exporting}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 transition-colors">
          {exporting ? <><span className="animate-spin">⏳</span> Preparing…</> : <><span>⬇️</span> Export my data</>}
        </button>
      </section>

      {/* ── Danger zone ───────────────────────────────────────────── */}
      <section className="rounded-xl border border-red-200 bg-red-50 p-6">
        <h2 className="mb-1 text-base font-semibold text-red-700">Danger zone</h2>
        <p className="mb-4 text-sm text-red-600">
          Permanently delete your account and all associated data. This action{" "}
          <strong>cannot be undone</strong>.
        </p>
        <button onClick={openModal}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 transition-colors">
          Delete my account
        </button>
      </section>

      {/* Confirmation modal */}
      {modal !== "closed" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold text-gray-900">Delete account permanently?</h3>
            <p className="mb-4 text-sm text-gray-600">
              This will erase all your data — career cycles, resumes, offers, alerts, tickets, and
              email preferences. You cannot undo this.
            </p>
            <p className="mb-1 text-sm font-medium text-gray-700">
              Type <span className="font-mono font-bold text-red-600">DELETE</span> to confirm:
            </p>
            <input type="text" value={confirmText} onChange={e => setConfirmText(e.target.value)}
              placeholder="DELETE" disabled={modal === "deleting"}
              className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono text-gray-900 placeholder-gray-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:bg-gray-50" />
            {deleteError && (
              <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{deleteError}</p>
            )}
            <div className="flex justify-end gap-3">
              <button onClick={closeModal} disabled={modal === "deleting"}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={confirmText !== "DELETE" || modal === "deleting"}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40 transition-colors">
                {modal === "deleting" ? "Deleting…" : "Delete account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
