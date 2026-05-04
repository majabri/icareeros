/**
 * /settings/account — Account
 *
 * Display Identity editor (Name + Phone + Profile Picture) + read-only auth metadata.
 *
 * Per Amir 2026-05-03 (final boundary):
 * - Display Name, Phone, and Profile Picture are owned and edited HERE. They
 *   write to user_profiles.{full_name, phone, avatar_url}.
 * - These three values appear on /mycareer/profile but are read-only there
 *   (the inputs are disabled with an "edit on Settings" hint).
 * - The /mycareer/profile Danger Zone (Delete profile) does NOT wipe these
 *   three columns — display identity is preserved across career-profile
 *   resets.
 * - The resume importer on /mycareer/profile may seed Name/Phone the FIRST
 *   time a resume is imported, ONLY if those columns are currently empty.
 *   It never overwrites values the user set here.
 */
"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

type Msg = { type: "success" | "error"; text: string };

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

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  } catch { return "—"; }
}

function Row({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-3 sm:gap-4 py-3 border-b border-gray-100 last:border-0">
      <dt className="text-sm font-medium text-gray-600">{label}</dt>
      <dd className={`text-sm text-gray-900 sm:col-span-2 ${mono ? "font-mono text-xs break-all" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

export default function AccountPage() {
  const supabase = createClient();

  const [user, setUser]                   = useState<User | null>(null);
  const [fullName, setFullName]           = useState("");
  const [phone, setPhone]                 = useState("");
  const [avatarUrl, setAvatarUrl]         = useState<string | null>(null);
  const [avatarFile, setAvatarFile]       = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [msg, setMsg]                     = useState<Msg | null>(null);
  const fileRef                           = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const u = data.user;
        if (!u) return;
        setUser(u);
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("full_name, phone, avatar_url")
          .eq("user_id", u.id)
          .maybeSingle();
        if (profile) {
          setFullName(profile.full_name ?? u.user_metadata?.full_name ?? "");
          setPhone(profile.phone ?? "");
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
      setMsg({ type: "error", text: "Image must be under 2 MB." });
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setMsg(null);
  }

  function handleRemovePhoto() {
    setAvatarFile(null);
    setAvatarPreview(null);
    setAvatarUrl(null);
    setMsg(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setMsg(null);
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
          full_name:  fullName.trim() || null,
          phone:      phone.trim() || null,
          avatar_url: finalAvatarUrl,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (error) throw new Error(error.message);
      setAvatarUrl(finalAvatarUrl);
      setAvatarFile(null);
      setAvatarPreview(null);
      window.dispatchEvent(new CustomEvent("icareeros:avatar-updated", { detail: { url: finalAvatarUrl } }));
      setMsg({ type: "success", text: "Display identity updated." });
    } catch (err) {
      setMsg({ type: "error", text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  const displayAvatar = avatarPreview ?? avatarUrl;
  const initials = fullName
    ? fullName.trim().split(/\s+/).map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : (user?.email?.[0] ?? "U").toUpperCase();

  if (loading) return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
    </div>
  );

  if (!user) return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <p className="text-sm text-gray-600">Not signed in.</p>
    </section>
  );

  const provider = user.app_metadata?.provider ?? "email";

  return (
    <div className="space-y-6">
      {/* ── Display Identity ─────────────────────────────────────────────── */}
      <form onSubmit={handleSave}>
        <section className="space-y-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Display Identity</h2>
            <p className="mt-1 text-sm text-gray-500">
              Your name, phone, and photo. These are shown next to <span className="font-medium">Settings</span> in the top bar
              and on your <Link href="/mycareer/profile" className="text-brand-600 hover:text-brand-700 font-medium underline-offset-2 hover:underline">Career Profile</Link>.
              They are preserved when you delete your career profile.
            </p>
          </div>

          {/* Avatar */}
          <div className="flex items-center gap-5">
            <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-full bg-brand-600 flex items-center justify-center">
              {displayAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={displayAvatar} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                <span className="text-2xl font-bold text-white">{initials}</span>
              )}
            </div>
            <div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp"
                onChange={handleAvatarChange} className="hidden" />
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors">
                  Change photo
                </button>
                {(displayAvatar) && (
                  <button type="button" onClick={handleRemovePhoto}
                    className="rounded-lg border border-transparent px-2 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">
                    Remove
                  </button>
                )}
              </div>
              <p className="mt-1.5 text-xs text-gray-400">PNG, JPG, GIF or WebP · max 2 MB</p>
            </div>
          </div>

          {/* Name + phone */}
          <div className="grid gap-4 sm:grid-cols-2 max-w-xl">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Display name</label>
              <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Phone</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 000-0000" autoComplete="tel"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
          </div>

          <StatusBanner msg={msg} />

          <button type="submit" disabled={saving}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors">
            {saving ? "Saving…" : "Save changes"}
          </button>
        </section>
      </form>

      {/* ── Account info (read-only) ─────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <header className="mb-4">
          <h2 className="text-base font-semibold text-gray-900">Account</h2>
          <p className="mt-1 text-sm text-gray-500">Read-only information about your sign-in account.</p>
        </header>
        <dl>
          <Row label="Email" value={user.email ?? "—"} />
          <Row label="Email confirmed" value={user.email_confirmed_at ? "Yes" : "Not yet — check your inbox"} />
          <Row label="Sign-in method" value={provider.charAt(0).toUpperCase() + provider.slice(1)} />
          <Row label="Member since" value={fmtDate(user.created_at)} />
          <Row label="Last sign-in" value={fmtDate(user.last_sign_in_at)} />
          <Row label="User ID" value={user.id} mono />
        </dl>
      </section>

      {/* ── Manage elsewhere ─────────────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900">Manage elsewhere</h3>
        <p className="mt-1 text-xs text-gray-500">Each area owns its own settings.</p>
        <ul className="mt-4 space-y-2 text-sm">
          <li>
            <Link href="/mycareer/profile" className="text-brand-600 hover:text-brand-700 font-medium">Career Profile</Link>
            <span className="text-gray-500"> — email, LinkedIn, Current Location, headline, summary, work, education, certifications, skills, portfolio, resume export. (Name, phone, photo are read-only there.)</span>
          </li>
          <li>
            <Link href="/settings/security" className="text-brand-600 hover:text-brand-700 font-medium">Security &amp; Compliance</Link>
            <span className="text-gray-500"> — password change, data export, account deletion.</span>
          </li>
          <li>
            <Link href="/settings/email" className="text-brand-600 hover:text-brand-700 font-medium">Notifications</Link>
            <span className="text-gray-500"> — email preferences.</span>
          </li>
          <li>
            <Link href="/settings/billing" className="text-brand-600 hover:text-brand-700 font-medium">Billing</Link>
            <span className="text-gray-500"> — plan and payment.</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
