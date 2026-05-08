"use client";

import { useState } from "react";

export interface ConsentState {
  privacyTerms: boolean;
  aiProcessing: boolean;
  marketingEmail: boolean;
}

interface Props {
  /**
   * Fired on every change.
   * @param state — current state of all three checkboxes
   * @param allRequiredMet — true when both required boxes (privacyTerms + aiProcessing) are checked
   */
  onChange: (state: ConsentState, allRequiredMet: boolean) => void;
}

/**
 * Three signup consent checkboxes per COWORK-BRIEF-legal-deploy-v1 Phase 2.
 * - privacyTerms: required (links to /legal/privacy and /legal/terms in new tab)
 * - aiProcessing: required (links to /legal/privacy#ai-processing in new tab)
 * - marketingEmail: optional
 *
 * Replaces the previous combined ToS+Privacy single checkbox. Keeps the existing
 * brand-cyan color (.accent-brand-600) instead of generic blue per repo style.
 */
export function ConsentCheckboxes({ onChange }: Props) {
  const [state, setState] = useState<ConsentState>({
    privacyTerms: false,
    aiProcessing: false,
    marketingEmail: false,
  });

  const update = (key: keyof ConsentState, value: boolean) => {
    const next = { ...state, [key]: value };
    setState(next);
    onChange(next, next.privacyTerms && next.aiProcessing);
  };

  return (
    <fieldset className="space-y-3 mt-4">
      <legend className="sr-only">Required consents to create your account</legend>

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          id="consent-privacy-terms"
          data-testid="consent-privacy-terms"
          checked={state.privacyTerms}
          onChange={(e) => update("privacyTerms", e.target.checked)}
          required
          aria-required="true"
          className="mt-1 h-4 w-4 flex-shrink-0 rounded border-gray-300 accent-brand-600"
        />
        <span className="text-sm text-gray-700 leading-relaxed">
          I have read and agree to the iCareerOS{" "}
          <a
            href="/legal/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand-700 underline hover:text-brand-800"
            onClick={(e) => e.stopPropagation()}
          >
            Privacy Policy
          </a>{" "}
          and{" "}
          <a
            href="/legal/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand-700 underline hover:text-brand-800"
            onClick={(e) => e.stopPropagation()}
          >
            Terms of Service
          </a>
          . <span className="text-red-500" aria-hidden="true">*</span>
        </span>
      </label>

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          id="consent-ai-processing"
          data-testid="consent-ai-processing"
          checked={state.aiProcessing}
          onChange={(e) => update("aiProcessing", e.target.checked)}
          required
          aria-required="true"
          className="mt-1 h-4 w-4 flex-shrink-0 rounded border-gray-300 accent-brand-600"
        />
        <span className="text-sm text-gray-700 leading-relaxed">
          I understand that iCareerOS uses AI (Claude by Anthropic) to analyze my career
          information and generate personalized recommendations. I consent to this AI
          processing as described in the{" "}
          <a
            href="/legal/privacy#ai-processing"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand-700 underline hover:text-brand-800"
            onClick={(e) => e.stopPropagation()}
          >
            Privacy Policy
          </a>
          . <span className="text-red-500" aria-hidden="true">*</span>
        </span>
      </label>

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          id="consent-marketing"
          data-testid="consent-marketing"
          checked={state.marketingEmail}
          onChange={(e) => update("marketingEmail", e.target.checked)}
          className="mt-1 h-4 w-4 flex-shrink-0 rounded border-gray-300 accent-brand-600"
        />
        <span className="text-sm text-gray-500 leading-relaxed">
          Send me product updates and career tips. (Optional)
        </span>
      </label>

      <p className="text-xs text-gray-400">
        <span className="text-red-500" aria-hidden="true">*</span> Required
      </p>
    </fieldset>
  );
}
