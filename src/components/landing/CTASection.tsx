export function CTASection() {
  return (
    <section id="demo" className="py-24" style={{ background: "var(--bg-page)" }}>
      <div className="mx-auto max-w-2xl px-6 text-center">
        {/* Glowing border container */}
        <div
          className="rounded-2xl p-px"
          style={{ background: "linear-gradient(135deg,#00f2ff,#00d4e8,rgba(0,242,255,0.2))" }}
        >
          <div className="rounded-2xl px-10 py-14" style={{ background: "var(--bg-surface)" }}>
            <span className="badge-brand mb-6">Get Started Free</span>
            <h2 className="mb-4 mt-4 text-4xl uppercase text-white">
              Ready to Transform<br/>
              <span className="text-brand-gradient">Your Career?</span>
            </h2>
            <p className="mb-10 text-lg leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Create your free account, complete your career evaluation, and get your
              personalized roadmap in under 15 minutes.
            </p>
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <a
                href="/auth/signup"
                className="bg-brand-gradient shadow-brand w-full rounded-xl px-10 py-4 text-base font-bold uppercase tracking-wide text-black transition hover:opacity-90 sm:w-auto"
              >
                Launch Your Journey →
              </a>
              <a
                href="/auth/login"
                className="glass w-full rounded-xl px-10 py-4 text-base font-semibold uppercase tracking-wide text-white transition hover:border-[rgba(0,242,255,0.4)] sm:w-auto"
              >
                Already have an account
              </a>
            </div>
            <p className="mt-6 text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              Free forever for individuals · No credit card required
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
