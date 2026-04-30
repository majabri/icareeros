export function LandingFooter() {
  return (
    <footer
      className="py-10"
      style={{ background: "var(--bg-surface)", borderTop: "1px solid var(--border-theme)" }}
    >
      <div className="mx-auto max-w-5xl px-6 flex flex-col items-center justify-between gap-4 sm:flex-row">
        <span className="text-xl font-black uppercase tracking-tight text-white">
          iCareer<span className="text-brand-gradient">OS</span>
        </span>
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
          © 2026 Jabri Solutions ·{" "}
          <a href="/privacy" className="transition hover:text-white">Privacy</a>
          {" · "}
          <a href="/terms" className="transition hover:text-white">Terms</a>
        </p>
      </div>
    </footer>
  );
}
