import { ConstellationBackground } from "@/components/ConstellationBackground";
import { Logo } from "@/components/brand/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ConstellationBackground />
      <div style={{ position: "relative", zIndex: 1 }}>
        {/* Logo bar — matches AppTopBar */}
        <header
          className="icareeros-topbar"
          style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 200,
          background: "rgba(255,255,255,0.96)",
          backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--surface-border, var(--neutral-300))",
          boxShadow: "0 1px 6px rgba(0,0,0,0.04)",
          height: "56px", display: "flex", alignItems: "center", padding: "0 1.5rem",
        }}>
          <a href="/" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }} aria-label="iCareerOS — home">
            <Logo variant="horizontal" width={220} ariaLabel="iCareerOS" />
          </a>
        </header>
        <div style={{ paddingTop: "56px" }}>
          {children}
        </div>
      </div>
    </>
  );
}
