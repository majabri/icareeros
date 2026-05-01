import { ConstellationBackground } from "@/components/ConstellationBackground";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ConstellationBackground />
      <div style={{ position: "relative", zIndex: 1 }}>
        {/* Logo bar — matches AppTopBar */}
        <header style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 200,
          background: "rgba(255,255,255,0.96)",
          backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--neutral-300)",
          boxShadow: "0 1px 6px rgba(0,0,0,0.04)",
          height: "56px", display: "flex", alignItems: "center", padding: "0 1.5rem",
        }}>
          <a href="/" style={{
            fontSize: "1.35rem", fontWeight: 800, letterSpacing: "-0.5px",
            textDecoration: "none",
            background: "linear-gradient(135deg, var(--primary) 0%, var(--secondary) 50%, var(--tertiary) 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
          }}>
            iCareerOS
          </a>
        </header>
        <div style={{ paddingTop: "56px" }}>
          {children}
        </div>
      </div>
    </>
  );
}
