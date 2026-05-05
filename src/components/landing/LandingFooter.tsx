"use client";

export function LandingFooter() {
  function openCookiePreferences() {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("icareeros:open-cookie-preferences"));
    }
  }

  return (
    <footer style={{
      background:"linear-gradient(135deg,var(--neutral-900) 0%,#1a1f2e 100%)",
      color:"var(--neutral-100)", padding:"3rem 1.5rem", textAlign:"center",
      borderTop:"2px solid var(--primary)",
    }}>
      <p style={{ color:"rgba(255,255,255,0.8)", fontSize:"0.9rem", marginBottom: "1rem" }}>
        &copy; {new Date().getFullYear()} iCareerOS. Your career. Your journey. Your success.
      </p>
      <nav aria-label="Legal" style={{ display:"flex", flexWrap:"wrap", gap:"1rem", justifyContent:"center", fontSize:"0.85rem" }}>
        <a href="/legal/privacy" style={{ color:"rgba(255,255,255,0.75)", textDecoration:"none" }}>Privacy</a>
        <a href="/legal/terms" style={{ color:"rgba(255,255,255,0.75)", textDecoration:"none" }}>Terms</a>
        <a href="/legal/cookies" style={{ color:"rgba(255,255,255,0.75)", textDecoration:"none" }}>Cookies</a>
        <a href="/legal/ai-disclosure" style={{ color:"rgba(255,255,255,0.75)", textDecoration:"none" }}>AI Disclosure</a>
        <button
          type="button"
          onClick={openCookiePreferences}
          style={{ background:"none", border:"none", cursor:"pointer", color:"rgba(255,255,255,0.75)", fontSize:"0.85rem", padding:0 }}
        >
          Cookie preferences
        </button>
      </nav>
    </footer>
  );
}
