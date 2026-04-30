const PAIN_POINTS = [
  {
    icon: "😤",
    title: "Sending hundreds of applications with zero responses",
    desc: "You spend hours crafting applications only to hear nothing back.",
  },
  {
    icon: "😕",
    title: "Not knowing which skills employers actually want",
    desc: "Job descriptions feel like a moving target — it's impossible to keep up.",
  },
  {
    icon: "😰",
    title: "Freezing up in interviews despite being qualified",
    desc: "You know you can do the job, but nerves and lack of practice cost you the offer.",
  },
  {
    icon: "💸",
    title: "Leaving salary on the table because you didn't negotiate",
    desc: "Most people accept the first offer — and forfeit tens of thousands per year.",
  },
  {
    icon: "🤷",
    title: "Having no clear path forward in your career",
    desc: "Without a roadmap, every decision feels like a guess.",
  },
];

export function ProblemSection() {
  return (
    <section className="bg-gray-50 py-24">
      <div className="mx-auto max-w-5xl px-6">
        <div className="mb-14 text-center">
          <span className="mb-3 inline-block rounded-full bg-red-50 px-4 py-1 text-sm font-semibold text-red-500">
            Sound Familiar?
          </span>
          <h2 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
            Your Job Search Shouldn&rsquo;t Feel Like This
          </h2>
          <p className="mt-4 text-lg text-gray-500">
            You&rsquo;re capable. You&rsquo;re qualified. But the system is broken — and you&rsquo;re fighting it alone.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PAIN_POINTS.map((p, i) => (
            <div
              key={i}
              className={`rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:shadow-md ${
                i === 4 ? "sm:col-span-2 lg:col-span-1" : ""
              }`}
            >
              <span className="mb-3 block text-3xl">{p.icon}</span>
              <h3 className="mb-2 text-base font-bold text-gray-800">{p.title}</h3>
              <p className="text-sm leading-relaxed text-gray-500">{p.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-14 text-center">
          <p className="text-xl font-semibold text-gray-700">
            There&rsquo;s a better way.
          </p>
          <p className="mt-2 text-gray-500">
            iCareerOS replaces guesswork with a structured, AI-guided career system.
          </p>
          <a
            href="/auth/signup"
            className="mt-6 inline-block rounded-xl px-8 py-3.5 text-sm font-bold text-white shadow transition hover:opacity-90"
            style={{ background: "linear-gradient(135deg,#00d9ff,#4ecdc4)" }}
          >
            Start Your Transformation →
          </a>
        </div>
      </div>
    </section>
  );
}
