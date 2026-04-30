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
    <section id="faq" className="bg-white py-24">
      <div className="mx-auto max-w-3xl px-6">
        <div className="mb-14 text-center">
          <span className="mb-3 inline-block rounded-full bg-teal-50 px-4 py-1 text-sm font-semibold text-teal-600">
            Got Questions?
          </span>
          <h2 className="text-4xl font-extrabold tracking-tight text-gray-900">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="divide-y divide-gray-100">
          {FAQS.map((faq, i) => (
            <div key={i} className="py-5">
              <button
                className="flex w-full items-start justify-between gap-4 text-left"
                onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
              >
                <span className="text-base font-semibold text-gray-800">{faq.q}</span>
                <span
                  className="mt-0.5 flex-shrink-0 text-xl font-light transition-transform duration-200"
                  style={{
                    color: "#00d9ff",
                    transform: open === i ? "rotate(45deg)" : "rotate(0deg)",
                  }}
                >
                  +
                </span>
              </button>
              {open === i && (
                <p className="mt-3 text-sm leading-relaxed text-gray-500">{faq.a}</p>
              )}
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-gray-400">
          Still have questions?{" "}
          <a href="mailto:support@icareeros.com" className="font-medium text-cyan-600 hover:underline">
            Contact us
          </a>
        </p>
      </div>
    </section>
  );
}
