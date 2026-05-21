"use client";

/**
 * RootVisionSection — platform vision on icareeros.com.
 * Per Amir 2026-05-20 — sharper voice, intelligent-OS framing throughout.
 */
export function RootVisionSection() {
  return (
    <section className="landing-fade-bg" style={{ padding:"6rem 3rem", background:"var(--neutral-100)" }}>
      <div style={{ maxWidth:780, margin:"0 auto" }}>
        <h2 style={{ fontSize:"2.5rem", fontWeight:800, marginBottom:"2rem", color:"var(--neutral-900)", textAlign:"center" }}>
          Why we built a system, not a tool.
        </h2>

        <div style={{ display:"flex", flexDirection:"column", gap:"1.5rem", color:"var(--neutral-800)", fontSize:"1.1rem", lineHeight:1.75 }}>
          <p>
            Most career products solve a fragment. A resume builder. A
            job board. A coaching session. A recruiter database. You
            buy one, you use it once, and then you&rsquo;re left
            assembling the pieces yourself — hoping they talk to each
            other, knowing they won&rsquo;t.
          </p>
          <p>
            We built iCareerOS because careers and hiring need
            <strong> infrastructure</strong>, not tools.
            Infrastructure that runs continuously. That connects the
            evaluation to the application, the skill gap to the
            learning path, the interview prep to the offer. A loop
            that doesn&rsquo;t stop when you land a role — it resets
            for the next one.
          </p>
          <p>
            The same is true on the employer side. Hiring tools give
            you access to more people. iCareerOS gives you access to
            the <em>right</em> ones — candidates who are already in
            the loop, already preparing, already signalling intent by
            opting in to be found.
          </p>
          <p>
            Both sides of hiring are broken in the same way:
            disconnected, reactive, and built for transactions instead
            of outcomes. iCareerOS is the intelligent operating system
            that connects them.
          </p>
        </div>
      </div>
    </section>
  );
}
