"use client";

import { useState } from "react";

interface Props {
  onChange: (consented: boolean) => void;
}

/**
 * Non-refundable acknowledgment shown directly above the payment button on the
 * Founding offer checkout page. Per COWORK-BRIEF-legal-deploy-v1 Phase 4.
 *
 * Amber callout style + required checkbox. Payment button gates on this.
 * Links to /legal/terms#founding-offer (new tab).
 */
export function FoundingOfferConsent({ onChange }: Props) {
  const [consented, setConsented] = useState(false);

  const handle = (checked: boolean) => {
    setConsented(checked);
    onChange(checked);
  };

  return (
    <div
      role="region"
      aria-label="Non-refundable purchase acknowledgment"
      className="my-6 rounded-lg border-2 border-amber-400 bg-amber-50 p-4"
    >
      <div className="mb-3 flex items-start gap-2">
        <span className="text-xl font-bold text-amber-600" aria-hidden="true">!</span>
        <h3 className="text-sm font-semibold text-amber-900">
          Important — Please Read Before Purchasing
        </h3>
      </div>
      <p className="mb-4 text-sm leading-relaxed text-amber-800">
        The <strong>$89.00 Founding Lifetime Access fee is NON-REFUNDABLE</strong> once
        payment is processed, except as required by applicable law in your jurisdiction.
        &quot;Lifetime&quot; access refers to the operational lifetime of the iCareerOS platform.
      </p>
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          id="founding-nonrefundable-consent"
          data-testid="founding-nonrefundable-consent"
          checked={consented}
          onChange={(e) => handle(e.target.checked)}
          required
          aria-required="true"
          className="mt-1 h-4 w-4 flex-shrink-0 rounded border-amber-400 accent-amber-600"
        />
        <span className="text-sm leading-relaxed text-amber-900">
          I have read and understand the{" "}
          <a
            href="/legal/terms#founding-offer"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-700 underline"
            onClick={(e) => e.stopPropagation()}
          >
            Founding Member Terms
          </a>
          , including that this purchase is <strong>non-refundable</strong>.{" "}
          <span className="text-red-600" aria-hidden="true">*</span>
        </span>
      </label>
    </div>
  );
}
