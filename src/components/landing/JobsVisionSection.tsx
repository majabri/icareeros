"use client";

/**
 * JobsVisionSection — vision block for the jobs landing.
 * Per COWORK-BRIEF-platform-landing-copy-v1.md Surface 1 —
 * "iJobsOS — a system, not an app."
 */
export function JobsVisionSection() {
  return (
    <section className="landing-fade-bg" style={{ padding:"6rem 3rem", background:"linear-gradient(135deg,var(--neutral-100) 0%,#f8fcff 100%)" }}>
      <div style={{ maxWidth:780, margin:"0 auto" }}>
        <h2 style={{ fontSize:"2.5rem", fontWeight:800, marginBottom:"2rem", color:"var(--neutral-900)", textAlign:"center" }}>
          iJobsOS — a system, not an app.
        </h2>

        <div style={{ display:"flex", flexDirection:"column", gap:"1.5rem", color:"var(--neutral-800)", fontSize:"1.1rem", lineHeight:1.75 }}>
          <p>
            Most career tools solve one problem. A resume builder. A job
            board. A mock interview tool. You patch them together and hope
            the pieces talk to each other. They don&rsquo;t.
          </p>
          <p>
            iCareerOS is infrastructure. It runs the full loop — from
            understanding where you stand today to managing the offer on
            the table — in one connected system. Every stage informs the
            next. Nothing falls through.
          </p>
          <p>
            When you land the role, the OS doesn&rsquo;t stop. It resets for
            the next goal. Because a career isn&rsquo;t a single destination
            — it&rsquo;s a system that needs to keep running.
          </p>
        </div>
      </div>
    </section>
  );
}
