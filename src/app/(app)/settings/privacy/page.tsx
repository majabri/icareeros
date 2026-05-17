"use client";

/**
 * /settings/privacy — Phase 2 recruiter discoverability controls.
 *
 * Two surfaces:
 *   (a) Discoverability toggle — controls `career_profiles.is_discoverable`.
 *       Off by default. When on, recruiter accounts on hire.icareeros.com
 *       can see the user's profile via the candidate search.
 *
 *   (b) Company block list — only visible when the toggle is on. Stores
 *       company names in `career_profiles.blocked_companies` (text[]).
 *       The API route filters blocked recruiters out server-side.
 *
 * Autosave: every state change writes to Supabase immediately. A small
 * "Saved ✓" badge flashes for 2s after each successful write.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";

export default function PrivacySettingsPage() {
  const supabase = createClient();

  const [loading, setLoading]   = useState(true);
  const [error,   setError]     = useState<string | null>(null);
  const [savedAt, setSavedAt]   = useState<number | null>(null);

  const [isDiscoverable, setIsDiscoverable]     = useState(false);
  const [blockedCompanies, setBlockedCompanies] = useState<string[]>([]);
  const [draftCompany, setDraftCompany]         = useState("");

  // Load current settings on mount.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!cancelled) setLoading(false); return; }
      const { data, error: readErr } = await supabase
        .from("career_profiles")
        .select("is_discoverable, blocked_companies")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (readErr) {
        setError(readErr.message);
        setLoading(false);
        return;
      }
      setIsDiscoverable(Boolean(data?.is_discoverable));
      setBlockedCompanies(Array.isArray(data?.blocked_companies) ? data!.blocked_companies : []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced "Saved ✓" pulse. Each successful persist refreshes the timer.
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function pulseSaved() {
    setSavedAt(Date.now());
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedAt(null), 2000);
  }

  // Persist helper — single source of truth. Optimistic UI: caller sets
  // local state first, then we attempt the write and revert + error on
  // failure.
  const persist = useCallback(async (
    patch: { is_discoverable?: boolean; blocked_companies?: string[] },
    revert: () => void,
  ) => {
    setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      revert();
      setError("Not signed in.");
      return;
    }
    const { error: upErr } = await supabase
      .from("career_profiles")
      .update(patch)
      .eq("user_id", user.id);
    if (upErr) {
      revert();
      setError(upErr.message);
      return;
    }
    pulseSaved();
  }, [supabase]);

  async function handleToggle() {
    const next = !isDiscoverable;
    const prev = isDiscoverable;
    setIsDiscoverable(next);
    await persist({ is_discoverable: next }, () => setIsDiscoverable(prev));
  }

  async function handleAddCompany() {
    const name = draftCompany.replace(/\s+/g, " ").trim();
    if (!name) return;
    // Dedupe case-insensitively.
    if (blockedCompanies.some((c) => c.toLowerCase() === name.toLowerCase())) {
      setDraftCompany("");
      return;
    }
    const prev = blockedCompanies;
    const next = [...blockedCompanies, name];
    setBlockedCompanies(next);
    setDraftCompany("");
    await persist({ blocked_companies: next }, () => setBlockedCompanies(prev));
  }

  async function handleRemoveCompany(name: string) {
    const prev = blockedCompanies;
    const next = blockedCompanies.filter((c) => c !== name);
    setBlockedCompanies(next);
    await persist({ blocked_companies: next }, () => setBlockedCompanies(prev));
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-32 animate-pulse rounded-xl bg-gray-100" />
        <div className="h-48 animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          ⚠ {error}
        </div>
      )}

      {savedAt && (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700 transition-opacity"
        >
          Saved ✓
        </div>
      )}

      {/* Card 1 — Discoverability toggle */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900">
              <span aria-hidden className="mr-1">🔍</span>
              Make my profile visible to recruiters
            </h2>
            <p className="mt-2 text-sm text-gray-600 leading-relaxed">
              When on, hiring managers on{" "}
              <strong className="text-gray-800">hire.icareeros.com</strong> can
              find your profile based on your skills and target roles. Your
              contact details are never shared without your consent.
            </p>
          </div>

          {/* Toggle switch — custom built (no shadcn dep in this project). */}
          <button
            type="button"
            role="switch"
            aria-checked={isDiscoverable}
            aria-label="Make my profile visible to recruiters"
            onClick={() => void handleToggle()}
            className={
              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center " +
              "rounded-full transition-colors focus:outline-none focus:ring-2 " +
              "focus:ring-brand-500 focus:ring-offset-2 " +
              (isDiscoverable ? "bg-brand-600" : "bg-gray-300")
            }
          >
            <span
              aria-hidden
              className={
                "inline-block h-5 w-5 transform rounded-full bg-white " +
                "shadow ring-0 transition-transform " +
                (isDiscoverable ? "translate-x-5" : "translate-x-0.5")
              }
            />
          </button>
        </div>
      </section>

      {/* Card 2 — Block list (only when discoverable). */}
      {isDiscoverable && (
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900">
            Hide my profile from these companies
          </h2>
          <p className="mt-2 text-sm text-gray-600 leading-relaxed">
            These companies won&apos;t be able to find or view your profile,
            even if you&apos;re discoverable.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleAddCompany();
            }}
            className="mt-4 flex gap-2"
          >
            <input
              type="text"
              value={draftCompany}
              onChange={(e) => setDraftCompany(e.target.value)}
              placeholder="e.g. Acme Corp, my current employer..."
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              aria-label="Company name to block"
            />
            <button
              type="submit"
              disabled={!draftCompany.trim()}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Add
            </button>
          </form>

          {blockedCompanies.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {blockedCompanies.map((company) => (
                <span
                  key={company}
                  className="inline-flex items-center gap-1.5 rounded-full bg-teal-500 px-3 py-1 text-xs font-medium text-white"
                >
                  {company}
                  <button
                    type="button"
                    onClick={() => void handleRemoveCompany(company)}
                    aria-label={`Remove ${company}`}
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-white/20"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {blockedCompanies.length === 0 && (
            <p className="mt-4 text-xs text-gray-500 italic">
              No companies blocked yet.
            </p>
          )}
        </section>
      )}

      <p className="text-xs text-gray-400">
        Want to update other privacy preferences?{" "}
        <Link href="/settings/security" className="underline hover:text-gray-600">
          Security &amp; Compliance settings
        </Link>{" "}
        cover data export, account deletion, and your consent history.
      </p>
    </div>
  );
}
