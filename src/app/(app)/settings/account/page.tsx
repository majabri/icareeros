/**
 * /settings/account — data export + account deletion
 */
"use client";

import { useState } from "react";
import { triggerDataExport, deleteAccount } from "@/services/accountService";

type ModalState = "closed" | "confirm" | "deleting" | "error";

export default function AccountSettingsPage() {
  // Export
  const [exporting, setExporting] = useState(false);

  // Delete modal
  const [modal, setModal] = useState<ModalState>("closed");
  const [confirmText, setConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function handleExport() {
    setExporting(true);
    triggerDataExport();
    // Reset spinner after a short delay (download starts, no response to await)
    setTimeout(() => setExporting(false), 2000);
  }

  async function handleDelete() {
    if (confirmText !== "DELETE") return;
    setModal("deleting");
    setDeleteError(null);
    try {
      await deleteAccount();
      // Account deleted — redirect to login (session is now invalid)
      window.location.href = "/auth/login?deleted=1";
    } catch (e) {
      setDeleteError((e as Error).message);
      setModal("error");
    }
  }

  function openModal() {
    setConfirmText("");
    setDeleteError(null);
    setModal("confirm");
  }

  function closeModal() {
    setModal("closed");
    setConfirmText("");
    setDeleteError(null);
  }

  return (
    <div className="space-y-8">
      {/* Data Export */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-base font-semibold text-gray-900">Export your data</h2>
        <p className="mb-4 text-sm text-gray-500">
          Download a copy of all your iCareerOS data — career cycles, resumes, offers, job alerts,
          support tickets, and email preferences — as a single JSON file.
        </p>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
        >
          {exporting ? (
            <><span className="animate-spin">⏳</span> Preparing…</>
          ) : (
            <><span>⬇️</span> Export my data</>
          )}
        </button>
      </section>

      {/* Danger zone */}
      <section className="rounded-xl border border-red-200 bg-red-50 p-6">
        <h2 className="mb-1 text-base font-semibold text-red-700">Danger zone</h2>
        <p className="mb-4 text-sm text-red-600">
          Permanently delete your account and all associated data. This action{" "}
          <strong>cannot be undone</strong>.
        </p>
        <button
          onClick={openModal}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 transition-colors"
        >
          Delete my account
        </button>
      </section>

      {/* Confirmation modal */}
      {modal !== "closed" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold text-gray-900">
              Delete account permanently?
            </h3>
            <p className="mb-4 text-sm text-gray-600">
              This will erase all your data — career cycles, resumes, offers, alerts, tickets, and
              email preferences. You cannot undo this.
            </p>
            <p className="mb-1 text-sm font-medium text-gray-700">
              Type <span className="font-mono font-bold text-red-600">DELETE</span> to confirm:
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder="DELETE"
              disabled={modal === "deleting"}
              className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono text-gray-900 placeholder-gray-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:bg-gray-50"
            />

            {deleteError && (
              <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                {deleteError}
              </p>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={closeModal}
                disabled={modal === "deleting"}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={confirmText !== "DELETE" || modal === "deleting"}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
              >
                {modal === "deleting" ? "Deleting…" : "Delete account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
