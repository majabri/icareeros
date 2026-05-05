"use client";

import { useEffect, useState } from "react";
import {
  readConsent,
  writeConsent,
  type ConsentRecord,
} from "@/lib/consent/storage";
import { detectGPC } from "@/lib/consent/gpc";
import { postConsent } from "@/lib/consent/api";

type Categories = {
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
};

export function CookieConsent() {
  const [mounted, setMounted] = useState(false);
  const [show, setShow] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [gpc, setGpc] = useState(false);
  const [cats, setCats] = useState<Categories>({
    functional: false,
    analytics: false,
    marketing: false,
  });

  useEffect(() => {
    setMounted(true);
    const existing = readConsent();
    const gpcOn = detectGPC();
    setGpc(gpcOn);

    if (existing) {
      // User has already chosen — don't show banner.
      setCats({
        functional: existing.functional,
        analytics: existing.analytics,
        marketing: existing.marketing,
      });
      setShow(false);
      return;
    }

    if (gpcOn) {
      // Auto-record a GPC-honoring opt-out for analytics/marketing,
      // but still surface the banner so the user can opt INTO functional.
      const record: ConsentRecord = writeConsent({
        necessary: true,
        functional: false,
        analytics: false,
        marketing: false,
        gpcDetected: true,
      });
      void postConsent(record, "cookie");
      setCats({ functional: false, analytics: false, marketing: false });
      setShow(true);
      return;
    }

    setShow(true);

    // Allow footer "Cookie preferences" to re-open the customize panel.
    const onOpen = () => {
      setShow(true);
      setShowCustomize(true);
    };
    window.addEventListener("icareeros:open-cookie-preferences", onOpen);
    return () => window.removeEventListener("icareeros:open-cookie-preferences", onOpen);
  }, []);

  function save(next: Categories) {
    const record = writeConsent({
      necessary: true,
      functional: next.functional,
      analytics: next.analytics,
      marketing: next.marketing,
      gpcDetected: gpc,
    });
    setCats(next);
    setShow(false);
    setShowCustomize(false);
    void postConsent(record, "cookie");
  }

  function rejectAll() {
    save({ functional: false, analytics: false, marketing: false });
  }

  function acceptAll() {
    save({ functional: true, analytics: true, marketing: true });
  }

  if (!mounted || !show) return null;

  if (showCustomize) {
    return <CustomizePanel cats={cats} setCats={setCats} onSave={() => save(cats)} onCancel={() => setShowCustomize(false)} />;
  }

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-[1000] border-t border-gray-200 bg-white/95 px-4 py-4 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] backdrop-blur"
      style={{ backdropFilter: "blur(8px)" }}
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-sm text-gray-700">
          We use cookies to keep iCareerOS working, remember your preferences, and (with your consent) understand how you use the service. See our{" "}
          <a href="/legal/cookies" className="font-medium text-brand-700 underline hover:text-brand-800">
            Cookie Policy
          </a>{" "}
          for details.
          {gpc && (
            <span className="mt-2 block text-xs text-gray-600">
              We detected your Global Privacy Control signal and have honored it as an opt-out of analytics and marketing cookies.
            </span>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={rejectAll}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            Reject all
          </button>
          <button
            type="button"
            onClick={() => setShowCustomize(true)}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            Customize
          </button>
          <button
            type="button"
            onClick={acceptAll}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}

function CustomizePanel({
  cats,
  setCats,
  onSave,
  onCancel,
}: {
  cats: Categories;
  setCats: (c: Categories) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cookie preferences"
      className="fixed inset-0 z-[1001] flex items-end justify-center bg-black/40 px-4 pb-4 sm:items-center sm:pb-0"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-gray-900">Cookie preferences</h2>
        <p className="mt-1 text-sm text-gray-600">
          Strictly necessary cookies are always on. The rest are off until you turn them on.
        </p>

        <div className="mt-5 space-y-4 text-sm">
          <Row
            label="Strictly necessary"
            description="Required for sign-in, security, and basic functionality."
            checked
            disabled
            onChange={() => undefined}
          />
          <Row
            label="Functional"
            description="Remember your language and theme preferences."
            checked={cats.functional}
            onChange={(v) => setCats({ ...cats, functional: v })}
          />
          <Row
            label="Analytics"
            description="Help us understand product usage in aggregate (Sentry error monitoring)."
            checked={cats.analytics}
            onChange={(v) => setCats({ ...cats, analytics: v })}
          />
          <Row
            label="Marketing"
            description="Not currently used."
            checked={cats.marketing}
            disabled
            onChange={() => undefined}
          />
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
          >
            Save preferences
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 disabled:opacity-60"
      />
      <span>
        <span className="block font-medium text-gray-900">{label}</span>
        <span className="block text-xs text-gray-600">{description}</span>
      </span>
    </label>
  );
}
