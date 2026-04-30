export function CTASection() {
  return (
    <section id="demo" className="py-24">
      <div className="mx-auto max-w-2xl px-6 text-center">
        {/* Gradient card */}
        <div
          className="rounded-3xl p-1 shadow-xl"
          style={{ background: "linear-gradient(135deg,#00d9ff,#4ecdc4,#ff6b6b)" }}
        >
          <div className="rounded-[calc(1.5rem-4px)] bg-white px-10 py-14">
            <span className="mb-3 inline-block rounded-full bg-cyan-50 px-4 py-1 text-sm font-semibold text-cyan-600">
              Get Started Free
            </span>
            <h2 className="mb-4 text-4xl font-extrabold tracking-tight text-gray-900">
              Ready to Transform Your Career?
            </h2>
            <p className="mb-10 text-lg leading-relaxed text-gray-500">
              Create your free account, complete your career evaluation, and get your
              personalized roadmap in under 15 minutes.
            </p>

            <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <a
                href="/auth/signup"
                className="w-full rounded-xl px-10 py-4 text-base font-bold text-white shadow-lg transition hover:opacity-90 hover:shadow-cyan-400/30 sm:w-auto"
                style={{ background: "linear-gradient(135deg,#00d9ff,#4ecdc4)" }}
              >
                Launch Your Journey →
              </a>
              <a
                href="/auth/login"
                className="w-full rounded-xl border border-gray-200 px-10 py-4 text-base font-semibold text-gray-600 transition hover:border-cyan-300 hover:text-cyan-700 sm:w-auto"
              >
                Already have an account
              </a>
            </div>

            <p className="mt-6 text-sm text-gray-400">
              Free forever for individuals · No credit card required
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
