/**
 * /settings/email — Email notification preferences
 *
 * Users can toggle weekly insights, job alerts, and marketing emails.
 * Also handles token-based unsubscribe via ?token=... query param.
 */

"use client";

import { useState, useEffect } from "react";
import {
  fetchEmailPreferences,
  updateEmailPreferences,
  DEFAULT_PREFERENCES,
  type EmailPreferences,
} from "@/services/emailPreferenceService";

// ── Toggle component ──────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors
        ${checked ? "bg-blue-600" : "bg-gray-200"}
        ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
          ${checked ? "translate-x-6" : "translate-x-1"}`}
      />
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EmailSettingsPage() {
  const [prefs, setPrefs] = useState<EmailPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unsubscribed, setUnsubscribed] = useState(false);

  // Effective values (fall back to defaults if no row saved yet)
  const effective = {
    weekly_insights: prefs?.weekly_insights ?? DEFAULT_PREFERENCES.weekly_insights,
    job_alerts: prefs?.job_alerts ?? DEFAULT_PREFERENCES.job_alerts,
    marketing: prefs?.marketing ?? DEFAULT_PREFERENCES.marketing,
  };

  useEffect(() => {
    // Check for unsubscribe token in URL
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (token) {
      fetch(`/api/email/preferences?token=${token}`)
        .then((r) => r.json())
        .then((d: { ok?: boolean }) => {
          if (d.ok) setUnsubscribed(true);
        })
        .catch(() => {});
    }

    fetchEmailPreferences()
      .then(setPrefs)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleToggle(
    field: "weekly_insights" | "job_alerts" | "marketing",
    value: boolean,
  ) {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const updated = await updateEmailPreferences({ [field]: value });
      setPrefs(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Email preferences</h1>
        <p className="mt-1 text-sm text-gray-500">
          Control which emails iCareerOS sends to you. Changes save automatically.
        </p>
      </div>

      {unsubscribed && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          ✓ You've been unsubscribed from all iCareerOS emails.
        </div>
      )}
      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {saved && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          ✓ Preferences saved
        </div>
      )}

      <div className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white shadow-sm">
        {/* Weekly insights */}
        <div className="flex items-start justify-between px-6 py-5">
          <div>
            <p className="text-sm font-semibold text-gray-900">Weekly career digest</p>
            <p className="mt-1 text-xs text-gray-500">
              Personalised insights, new job matches, and career tips — sent every Sunday.
            </p>
          </div>
          <Toggle
            checked={effective.weekly_insights}
            onChange={(v) => handleToggle("weekly_insights", v)}
            disabled={saving}
          />
        </div>

        {/* Job alerts */}
        <div className="flex items-start justify-between px-6 py-5">
          <div>
            <p className="text-sm font-semibold text-gray-900">Job alert emails</p>
            <p className="mt-1 text-xs text-gray-500">
              New opportunities matching your saved search criteria.
            </p>
          </div>
          <Toggle
            checked={effective.job_alerts}
            onChange={(v) => handleToggle("job_alerts", v)}
            disabled={saving}
          />
        </div>

        {/* Marketing */}
        <div className="flex items-start justify-between px-6 py-5">
          <div>
            <p className="text-sm font-semibold text-gray-900">Product updates</p>
            <p className="mt-1 text-xs text-gray-500">
              New features, tips, and occasional announcements from iCareerOS.
            </p>
          </div>
          <Toggle
            checked={effective.marketing}
            onChange={(v) => handleToggle("marketing", v)}
            disabled={saving}
          />
        </div>
      </div>

      <p className="mt-6 text-xs text-gray-400">
        Transactional emails (account security, password resets) are always sent regardless of
        these preferences.
      </p>
    </div>
  );
}
