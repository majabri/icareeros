export function LandingFooter() {
  return (
    <footer style={{
      background:"linear-gradient(135deg,var(--neutral-900) 0%,#1a1f2e 100%)",
      color:"var(--neutral-100)", padding:"3rem", textAlign:"center",
      borderTop:"2px solid var(--primary)",
    }}>
      <p style={{ color:"rgba(255,255,255,0.8)", fontSize:"0.9rem" }}>
        &copy; 2025 iCareerOS. Your career. Your journey. Your success.
      </p>
    </footer>
  );
}
