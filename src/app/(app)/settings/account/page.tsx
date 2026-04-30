/**
 * /settings/account — Account & Security
 * Identity (name + avatar), password change, data export, account deletion
 */
"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import { triggerDataExport, deleteAccount } from "@/services/accountService";

type Msg        = { type: "success" | "error"; text: string };
type ModalState = "closed" | "confirm" | "deleting" | "error";

function StatusBanner({ msg }: { msg: Msg | null }) {
  if (!msg) return null;
  return (
    <div
      className={`rounded-lg border px-4 py-2.5 text-sm ${
        msg.type === "success"
          ? "border-green-200 bg-green-50 text-green-700"
          : "border-red-200 bg-red-50 text-red-700"
      }`}
    >
      {msg.type === "success" ? "✓ " : "⚠ "}{msg.text}
    </div>
  );
}

export default function AccountSecurityPage() {
  const supabase = createClient();

  // Identity
  const [user, setUser]                     = useState<User | null>(null);
  const [fullName, setFullName]             = useState("");
  const [avatarUrl, setAvatarUrl]           = useState<string | null>(null);
  const [avatarFile, setAvatarFile]         = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview]   = useState<string | null>(null);
  const fileRef                             = useRef<HTMLInputElement>(null);

  // Password
  const [newPassword, setNewPassword]       = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Status
  const [profileSaving, setProfileSaving]  = useState(false);
  const [pwSaving, setPwSaving]            = useState(false);
  const [profileMsg, setProfileMsg]        = useState<Msg | null>(null);
  const [pwMsg, setPwMsg]                  = useState<Msg | null>(null);
  const [loading, setLoading]              = useState(true);

  // Export / delete
  const [exporting, setExporting]          = useState(false);
  const [modal, setModal]                  = useState<ModalState>("closed");
  const [confirmText, setConfirmText]      = useState("");
  const [deleteError, setDeleteError]      = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const u = data.user;
        if (!u) return;
        setUser(u);
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("full_name, avatar_url")
          .eq("user_id", u.id)
          .maybeSingle();
        if (profile) {
          setFullName(profile.full_name ?? u.user_metadata?.full_name ?? "");
          setAvatarUrl(profile.avatar_url ?? null);
        } else {
          setFullName(u.user_metadata?.full_name ?? "");
        }
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setProfileMsg({ type: "error", text: "Image must be under 2 MB." });
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setProfileMsg(null);
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setProfileSaving(true);
    setProfileMsg(null);
    try {
      let finalAvatarUrl = avatarUrl;
      if (avatarFile) {
        const ext  = avatarFile.name.split(".").pop() ?? "jpg";
        const path = `${user.id}/avatar.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("avatars")
          .upload(path, avatarFile, { upsert: true, contentType: avatarFile.type });
        if (uploadErr) throw new Error(uploadErr.message);
        const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
        finalAvatarUrl = `${urlData.publicUrl}?v=${Date.now()}`;
      }
      const { error } = await supabase.from("user_profiles").upsert(
        {
          user_id:    user.id,
          full_name:  fullName.trim(),
          avatar_url: finalAvatarUrl,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (error) throw new Error(error.message);
      setAvatarUrl(finalAvatarUrl);
      setAvatarFile(null);
      setProfileMsg({ type: "success", text: "Profile updated." });
    } catch (err) {
      setProfileMsg({ type: "error", text: (err as Error).message });
    } finally {
      setProfileSaving(false);
    }
  }

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

  const displayAvatar = avatarPreview ?? avatarUrl;
  const initials = fullName
    ? fullName.trim().split(/\s+/).map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : (user?.email?.[0] ?? "U").toUpperCase();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-8">

      {/* ── Identity card ──────────────────────────────────────────── */}
      <form onSubmit={handleSaveProfile}>
        <section className="space-y-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Identity</h2>
            <p className="mt-1 text-sm text-gray-500">Your display name and profile picture.</p>
          </div>

          {/* Avatar */}
          <div className="flex items-center gap-5">
            <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-full bg-blue-600 flex items-center justify-center">
              {displayAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={displayAvatar} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                <span className="text-2xl font-bold text-white">{initials}</span>
              )}
            </div>
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                onChange={handleAvatarChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
              >
                Change photo
              </button>
              <p className="mt-1.5 text-xs text-gray-400">PNG, JPG, GIF or WebP · max 2 MB</p>
            </div>
          </div>

          {/* Full name */}
          <div className="max-w-sm">
            <label className="mb-1 block text-sm font-medium text-gray-700">Full name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your name"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Email (read-only) */}
          <div className="max-w-sm">
            <label className="mb-1 block text-sm font-medium text-gray-700">Email address</label>
            <input
              type="email"
              value={user?.email ?? ""}
              readOnly
              className="w-full cursor-default rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
            />
            <p className="mt-1 text-xs text-gray-400">
              Email cannot be changed here. Contact support if needed.
            </p>
          </div>

          <StatusBanner msg={profileMsg} />

          <button
            type="submit"
            disabled={profileSaving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          >
            {profileSaving ? "Saving…" : "Save changes"}
          </button>
        </section>
      </form>

      {/* ── Security card ──────────────────────────────────────────── */}
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
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                autoComplete="new-password"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Confirm password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                autoComplete="new-password"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          <StatusBanner msg={pwMsg} />
          <button
            type="submit"
            disabled={pwSaving || !newPassword || !confirmPassword}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          >
            {pwSaving ? "Updating…" : "Update password"}
          </button>
        </section>
      </form>

      {/* ── Your data card ─────────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-base font-semibold text-gray-900">Your data</h2>
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

      {/* ── Danger zone ────────────────────────────────────────────── */}
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
