/**
 * /settings/profile — display name, avatar upload, password change
 */
"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

type Msg = { type: "success" | "error"; text: string };

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

export default function ProfileSettingsPage() {
  const supabase = createClient();

  const [user, setUser]           = useState<User | null>(null);
  const [fullName, setFullName]   = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile]     = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Password
  const [newPassword, setNewPassword]         = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Status
  const [profileSaving, setProfileSaving] = useState(false);
  const [pwSaving, setPwSaving]           = useState(false);
  const [profileMsg, setProfileMsg]       = useState<Msg | null>(null);
  const [pwMsg, setPwMsg]                 = useState<Msg | null>(null);
  const [loading, setLoading]             = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) { setLoading(false); return; }
      setUser(u);
      supabase
        .from("user_profiles")
        .select("full_name, avatar_url")
        .eq("user_id", u.id)
        .maybeSingle()
        .then(({ data: profile }) => {
          if (profile) {
            setFullName(profile.full_name ?? u.user_metadata?.full_name ?? "");
            setAvatarUrl(profile.avatar_url ?? null);
          } else {
            // Fall back to OAuth metadata
            setFullName(u.user_metadata?.full_name ?? "");
          }
        })
        .finally(() => setLoading(false));
    });
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
        // Bust cache with a version param
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
      {/* ── Profile card ─────────────────────────────────────────────── */}
      <form onSubmit={handleSaveProfile}>
        <section className="space-y-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Profile</h2>
            <p className="mt-1 text-sm text-gray-500">
              Update your display name and profile picture.
            </p>
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
              <p className="mt-1.5 text-xs text-gray-400">
                PNG, JPG, GIF or WebP · max 2 MB
              </p>
            </div>
          </div>

          {/* Full name */}
          <div className="max-w-sm">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Full name
            </label>
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
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Email address
            </label>
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

      {/* ── Password card ─────────────────────────────────────────────── */}
      <form onSubmit={handleChangePassword}>
        <section className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Change password</h2>
            <p className="mt-1 text-sm text-gray-500">
              Set a new password. If you signed in with Google or Apple you can use this
              to add a password to your account.
            </p>
          </div>

          <div className="max-w-sm space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                New password
              </label>
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
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Confirm password
              </label>
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
    </div>
  );
}
