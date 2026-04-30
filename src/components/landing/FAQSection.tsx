"use client";

import { useState } from "react";

const FAQS = [
  {
    q: "Is iCareerOS really free to start?",
    a: "Yes — your core Career OS profile, career assessment, and dashboard are completely free. Premium features like unlimited AI interview simulations, salary intelligence, and advanced resume rewrites are available on paid plans.",
  },
  {
    q: "How is this different from LinkedIn or other job platforms?",
    a: "LinkedIn is a network and job board. iCareerOS is a full career operating system — it guides you through self-evaluation, skill-building, job searching, interview prep, offer negotiation, and long-term growth. We work alongside LinkedIn, not instead of it.",
  },
  {
    q: "How does the AI personalization work?",
    a: "Your career profile feeds a structured AI that understands your experience, goals, and gaps. Every recommendation — from skill courses to interview questions to salary benchmarks — is specific to you, not generic advice.",
  },
  {
    q: "What if I'm not currently job hunting?",
    a: "iCareerOS is designed for every career stage. Whether you're actively searching, growing in your current role, planning a pivot, or building toward leadership — the system adapts to where you are right now.",
  },
  {
    q: "How long does it take to get started?",
    a: "Your initial career profile takes about 10 minutes to complete. From there, you'll have a personalized dashboard with your career stage, recommended next actions, and AI-powered tools ready to use immediately.",
  },
];

export function FAQSection() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section id="faq" className="py-24" style={{ background: "var(--bg-surface)", borderTop: "1px solid var(--border-theme)" }}>
      <div className="mx-auto max-w-3xl px-6">
        <div className="mb-14 text-center">
          <span className="badge-brand mb-4">Got Questions?</span>
          <h2 className="mt-4 text-4xl uppercase text-white">Frequently Asked Questions</h2>
        </div>

        <div style={{ borderTop: "1px solid var(--border-theme)" }}>
          {FAQS.map((faq, i) => (
            <div key={i} style={{ borderBottom: "1px solid var(--border-theme)" }}>
              <button
                className="flex w-full items-start justify-between gap-4 py-5 text-left"
                onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
              >
                <span className="text-sm font-bold uppercase tracking-wide text-white">{faq.q}</span>
                <span
                  className="mt-0.5 flex-shrink-0 text-xl font-light transition-transform duration-200"
                  style={{ color: "var(--brand)", transform: open === i ? "rotate(45deg)" : "rotate(0deg)" }}
                >
                  +
                </span>
              </button>
              {open === i && (
                <p className="pb-5 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{faq.a}</p>
              )}
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          Still have questions?{" "}
          <a href="mailto:support@icareeros.com" className="font-bold hover:underline" style={{ color: "var(--brand)" }}>
            Contact us
          </a>
        </p>
      </div>
    </section>
  );
}
