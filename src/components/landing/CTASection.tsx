export function CTASection() {
  return (
    <section id="demo" className="bg-white py-24">
      <div className="mx-auto max-w-2xl px-6 text-center">
        <span className="mb-3 inline-block rounded-full bg-emerald-50 px-4 py-1 text-sm font-medium text-emerald-600">
          Get Started Free
        </span>
        <h2 className="mb-4 text-4xl font-bold text-gray-900">
          Ready to transform your career?
        </h2>
        <p className="mb-10 text-lg leading-relaxed text-gray-500">
          Create your free account, complete your career evaluation, and get your
          personalized roadmap in under 15 minutes.
        </p>

        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <a
            href="/auth/signup"
            className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-10 py-4 text-base font-semibold text-white shadow-lg transition hover:from-blue-500 hover:to-violet-500 sm:w-auto"
          >
            Start for free →
          </a>
          <a
            href="/auth/login"
            className="w-full rounded-xl border border-gray-200 px-10 py-4 text-base font-medium text-gray-600 transition hover:border-gray-400 sm:w-auto"
          >
            Already have an account
          </a>
        </div>

        <p className="mt-6 text-sm text-gray-400">
          Trusted by career professionals across industries.
          <br />
          Free forever for individuals — premium plans for teams.
        </p>
      </div>
    </section>
  );
}
