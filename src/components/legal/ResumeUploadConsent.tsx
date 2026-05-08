"use client";

import { useEffect, useRef } from "react";

interface Props {
  onAccept: () => void;
  onDecline: () => void;
}

/**
 * Consent modal shown before any resume upload (file picker or drag-drop).
 * Per COWORK-BRIEF-legal-deploy-v1 Phase 3.
 *
 * Accessibility:
 * - role="dialog" aria-modal="true"
 * - title id referenced via aria-labelledby
 * - Accept button gets initial focus on mount
 * - Esc dismisses (treated as decline)
 *
 * Note: This is shown on EVERY upload — not session-cached. That's intentional
 * so the consent_records audit trail has one row per upload event.
 */
export function ResumeUploadConsent({ onAccept, onDecline }: Props) {
  const acceptRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    acceptRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onDecline();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDecline]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="resume-consent-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 id="resume-consent-title" className="mb-4 text-lg font-semibold">
          Before You Upload Your Resume
        </h2>
        <div className="mb-6 space-y-3 text-sm text-gray-700">
          <p>By uploading your resume, you authorize iCareerOS to:</p>
          <ul className="ml-2 list-inside list-disc space-y-1 text-gray-600">
            <li>Process your resume using Claude AI (by Anthropic)</li>
            <li>Generate career assessments and recommendations</li>
            <li>Securely store your resume for the duration of your account</li>
          </ul>
          <p className="text-xs text-gray-500">
            Your resume will not be shared with employers without your explicit
            instruction. Delete your data any time from Account Settings.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            data-testid="resume-consent-cancel"
            onClick={onDecline}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400"
          >
            Cancel
          </button>
          <button
            type="button"
            ref={acceptRef}
            data-testid="resume-consent-accept"
            onClick={onAccept}
            className="flex-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            I Understand — Continue
          </button>
        </div>
      </div>
    </div>
  );
}
