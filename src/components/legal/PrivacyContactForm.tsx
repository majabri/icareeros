"use client";

import { useState } from "react";
import { submitPrivacyContact, type ContactInput } from "@/app/actions/legalContactActions";

const INITIAL: ContactInput = {
  name: "",
  email: "",
  postalAddress: "",
  message: "",
  website: "",
};

/**
 * Privacy / legal contact form. Used in place of a published mailing address.
 * Submission is delivered to the iCareerOS legal mailbox via Bluehost SMTP (server action).
 *
 * Honeypot: hidden `website` field — bots fill it; the action silently
 * "succeeds" without sending. Also enforces server-side zod validation.
 *
 * Per COWORK-BRIEF-legal-finalize-v1 (Amir 2026-05-07).
 */
export function PrivacyContactForm() {
  const [form, setForm] = useState<ContactInput>(INITIAL);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function update<K extends keyof ContactInput>(key: K, value: ContactInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus(null);
    setLoading(true);
    try {
      const res = await submitPrivacyContact(form);
      if (res.ok) {
        setStatus({ kind: "ok", text: "Message sent. We aim to respond within the timeframe set out in our Privacy Policy." });
        setForm(INITIAL);
      } else {
        setStatus({ kind: "err", text: res.error });
      }
    } catch {
      setStatus({ kind: "err", text: "Could not send your message. Please try again later." });
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    "mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm " +
    "text-gray-900 placeholder-gray-400 shadow-sm " +
    "focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 " +
    "disabled:bg-gray-50 disabled:text-gray-500";

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {/* Honeypot — visually hidden; real users never fill this. Bots do. */}
      <div aria-hidden="true" className="hidden" style={{ position: "absolute", left: "-10000px", top: "auto", width: 1, height: 1, overflow: "hidden" }}>
        <label htmlFor="contact-website">Website (leave blank)</label>
        <input
          tabIndex={-1}
          autoComplete="off"
          id="contact-website"
          type="text"
          value={form.website ?? ""}
          onChange={(e) => update("website", e.target.value)}
        />
      </div>

      <div>
        <label htmlFor="contact-name" className="block text-sm font-medium text-gray-700">
          Your name
        </label>
        <input
          id="contact-name"
          data-testid="legal-contact-name"
          type="text"
          required
          maxLength={120}
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="contact-email" className="block text-sm font-medium text-gray-700">
          Your email
        </label>
        <input
          id="contact-email"
          data-testid="legal-contact-email"
          type="email"
          required
          maxLength={254}
          value={form.email}
          onChange={(e) => update("email", e.target.value)}
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="contact-address" className="block text-sm font-medium text-gray-700">
          Postal address (so we can mail you back if needed)
        </label>
        <textarea
          id="contact-address"
          data-testid="legal-contact-address"
          required
          maxLength={500}
          rows={3}
          value={form.postalAddress}
          onChange={(e) => update("postalAddress", e.target.value)}
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="contact-message" className="block text-sm font-medium text-gray-700">
          Your message
        </label>
        <textarea
          id="contact-message"
          data-testid="legal-contact-message"
          required
          minLength={10}
          maxLength={5000}
          rows={6}
          value={form.message}
          onChange={(e) => update("message", e.target.value)}
          className={inputCls}
          placeholder="What would you like us to address? Privacy questions, data subject requests, and other legal correspondence are all welcome."
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        data-testid="legal-contact-submit"
        className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold
                   text-white shadow-sm hover:bg-brand-700 focus-visible:outline
                   focus-visible:outline-2 focus-visible:outline-brand-600
                   disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
      >
        {loading ? "Sending…" : "Send message"}
      </button>

      {status && (
        <div
          role={status.kind === "err" ? "alert" : "status"}
          className={
            status.kind === "ok"
              ? "rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700"
              : "rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          }
        >
          {status.text}
        </div>
      )}

      <p className="text-xs text-gray-500">
        We do not retain your submission beyond what is needed to respond and meet our
        legal obligations.
      </p>
    </form>
  );
}
