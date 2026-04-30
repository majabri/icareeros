/**
 * IntegrationStatus — shows LinkedIn / Indeed connection status on /profile or /jobs.
 * - When API key is configured (server env): shows "Connected"
 * - When not configured: shows "Coming soon" nudge
 *
 * Status is checked via /api/health observability flags (publicly available).
 */
"use client";

import { useState, useEffect } from "react";

interface HealthObservability {
  linkedin: boolean;
  indeed: boolean;
}

const INTEGRATIONS = [
  {
    key: "linkedin" as const,
    name: "LinkedIn",
    icon: "💼",
    description: "Import your LinkedIn profile to auto-fill career data.",
    comingSoonText: "Connect LinkedIn to auto-populate your profile and import job history.",
    docsEnvVar: "LINKEDIN_API_KEY",
  },
  {
    key: "indeed" as const,
    name: "Indeed",
    icon: "🔍",
    description: "Search Indeed jobs alongside your iCareerOS radar.",
    comingSoonText: "Connect Indeed Publisher API to add Indeed listings to your Opportunity Radar.",
    docsEnvVar: "INDEED_PUBLISHER_ID",
  },
];

export function IntegrationStatus() {
  const [status, setStatus] = useState<HealthObservability | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then(r => r.json())
      .then((d: { integrations?: HealthObservability }) => setStatus(d.integrations ?? null))
      .catch(() => setStatus({ linkedin: false, indeed: false }));
  }, []);

  if (!status) return null;

  return (
    <div className="space-y-3">
      {INTEGRATIONS.map(({ key, name, icon, description, comingSoonText, docsEnvVar }) => {
        const connected = status[key];
        return (
          <div
            key={key}
            className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <span className="text-2xl" aria-hidden="true">{icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-gray-900">{name}</span>
                {connected ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    ✓ Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                    Coming soon
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500">
                {connected ? description : comingSoonText}
              </p>
              {!connected && (
                <p className="mt-1 text-xs text-gray-400">
                  Set <code className="rounded bg-gray-100 px-1 font-mono">{docsEnvVar}</code> in Vercel to enable.
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
