"use client";
import { IconX } from "@tabler/icons-react";

/**
 * HirePainSection — five recruiter pain points.
 * Per COWORK-BRIEF-platform-landing-copy-v1.md Surface 2.
 */
const PAINS = [
  "Sourcing lists full of people who haven't looked for a job in three years",
  "InMails ignored because candidates are not actually looking",
  "Screening calls that reveal the resume was a stretch",
  "Offer stage surprises — salary expectations nowhere near reality",
  "Time-to-fill measured in months, not weeks",
];

export function HirePainSection() {
  return (
    <section id="pain" className="landing-fade-bg" style={{ padding:"6rem 3rem", background:"linear-gradient(135deg,#fff5f7 0%,#f5f7ff 50%,#e8f5ff 100%)" }}>
      <div style={{ maxWidth:900, margin:"0 auto", textAlign:"center" }}>
        <h2 style={{ fontSize:"2.5rem", fontWeight:800, marginBottom:"0.75rem", color:"var(--neutral-900)" }}>
          Most hiring tools were built for the wrong problem.
        </h2>
        <p style={{ fontSize:"1.15rem", color:"var(--neutral-700)", marginBottom:"2.5rem" }}>
          They give you access to more people. You need access to the right ones.
        </p>

        <div style={{ display:"flex", flexDirection:"column", gap:"1.25rem", textAlign:"left", maxWidth:720, margin:"0 auto" }}>
          {PAINS.map(p => (
            <div
              key={p}
              style={{
                fontSize: "1.1rem",
                color: "var(--neutral-800)",
                paddingLeft: "2.5rem",
                position: "relative",
                display: "flex",
                alignItems: "flex-start",
                gap: "0.75rem",
              }}
            >
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  left: 0,
                  top: "0.15rem",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "1.5rem",
                  height: "1.5rem",
                  borderRadius: "9999px",
                  background: "rgba(255, 107, 107, 0.12)",
                  color: "#FF6B6B",
                }}
              >
                <IconX size={16} stroke={1.5} />
              </span>
              {p}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
