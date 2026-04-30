const PAIN_POINTS = [
  { icon: "😤", title: "Sending hundreds of applications with zero responses",   desc: "You spend hours crafting applications only to hear nothing back." },
  { icon: "😕", title: "Not knowing which skills employers actually want",         desc: "Job descriptions feel like a moving target — impossible to keep up." },
  { icon: "😰", title: "Freezing up in interviews despite being qualified",        desc: "You know you can do the job, but nerves cost you the offer." },
  { icon: "💸", title: "Leaving salary on the table because you didn't negotiate", desc: "Most people accept the first offer — and forfeit tens of thousands per year." },
  { icon: "🤷", title: "Having no clear path forward in your career",             desc: "Without a roadmap, every decision feels like a guess." },
];

export function ProblemSection() {
  return (
    <section className="py-24" style={{ background: "var(--bg-page)" }}>
      <div className="mx-auto max-w-5xl px-6">
        <div className="mb-14 text-center">
          <span className="badge-brand mb-4">Sound Familiar?</span>
          <h2 className="mt-4 text-4xl uppercase text-white sm:text-5xl">
            Your Job Search Shouldn&rsquo;t<br/>
            <span className="text-brand-gradient">Feel Like This</span>
          </h2>
          <p className="mt-5 text-lg" style={{ color: "var(--text-secondary)" }}>
            You&rsquo;re capable. You&rsquo;re qualified. But the system is broken — and you&rsquo;re fighting it alone.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PAIN_POINTS.map((p, i) => (
            <div
              key={i}
              className={`card-dark p-6 ${i === 4 ? "sm:col-span-2 lg:col-span-1" : ""}`}
            >
              <span className="mb-3 block text-3xl">{p.icon}</span>
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-white">{p.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{p.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-14 text-center">
          <p className="text-lg font-bold uppercase tracking-wide text-white">There&rsquo;s a better way.</p>
          <p className="mt-2" style={{ color: "var(--text-secondary)" }}>
            iCareerOS replaces guesswork with a structured, AI-guided career system.
          </p>
          <a
            href="/auth/signup"
            className="bg-brand-gradient shadow-brand mt-6 inline-block rounded-xl px-8 py-3.5 text-sm font-bold uppercase tracking-wide text-black transition hover:opacity-90"
          >
            Start Your Transformation →
          </a>
        </div>
      </div>
    </section>
  );
}
