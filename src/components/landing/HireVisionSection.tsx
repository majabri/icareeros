"use client";

/**
 * HireVisionSection — vision block for the hire landing.
 * Per COWORK-BRIEF-platform-landing-copy-v1.md Surface 2 — "Built for
 * the candidate who's ready, not just available."
 */
export function HireVisionSection() {
  return (
    <section className="landing-fade-bg" style={{ padding:"6rem 3rem", background:"linear-gradient(135deg,var(--neutral-100) 0%,#f8fcff 100%)" }}>
      <div style={{ maxWidth:780, margin:"0 auto" }}>
        <h2 style={{ fontSize:"2.5rem", fontWeight:800, marginBottom:"2rem", color:"var(--neutral-900)", textAlign:"center" }}>
          Built for the candidate who&rsquo;s ready, not just available.
        </h2>

        <div style={{ display:"flex", flexDirection:"column", gap:"1.5rem", color:"var(--neutral-800)", fontSize:"1.1rem", lineHeight:1.75 }}>
          <p>
            The best candidates aren&rsquo;t refreshing job boards waiting
            for a ping. They&rsquo;re managing their career deliberately —
            assessing market fit, closing skill gaps, practising for
            interviews. iCareerOS is where they do that work.
          </p>
          <p>
            When they opt in to be discoverable, they&rsquo;re not just
            available. They&rsquo;re prepared. They know what roles fit.
            They&rsquo;ve seen their own fit scores. They&rsquo;ve done
            interview prep for the kind of role you&rsquo;re hiring for.
            That&rsquo;s a different kind of first conversation.
          </p>
          <p>
            iCareerOS gives hiring teams access to that candidate — the
            one who shows up knowing what they want, why they&rsquo;re a
            fit, and what the offer should look like. That&rsquo;s not a
            pipeline problem. That&rsquo;s a hiring advantage.
          </p>
        </div>
      </div>
    </section>
  );
}
