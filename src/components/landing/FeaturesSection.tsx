const FEATURES = [
  {
    icon: "🤖",
    title: "AI-Powered Guidance",
    description:
      "Claude AI analyzes your profile, market data, and goals to give you personalized, actionable career advice — not generic tips.",
  },
  {
    icon: "🗺️",
    title: "Personalized Roadmap",
    description:
      "Get a custom path from where you are today to where you want to be, with milestones you can actually hit.",
  },
  {
    icon: "📈",
    title: "Real Outcomes",
    description:
      "Track your progress through every career OS stage and see measurable improvement at each cycle.",
  },
  {
    icon: "🔄",
    title: "Cyclical, Not Linear",
    description:
      "Careers evolve. iCareerOS grows with you — each cycle resets and levels up as your goals change.",
  },
  {
    icon: "🎯",
    title: "Stage-Locked Focus",
    description:
      "Work on the right thing at the right time. No overwhelm — just the next best action for your current stage.",
  },
  {
    icon: "💼",
    title: "Opportunity Radar",
    description:
      "Discover curated job opportunities with AI-scored fit ratings, so you only apply where it counts.",
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="bg-gray-50 py-24">
      <div className="mx-auto max-w-5xl px-6">
        <div className="mb-16 text-center">
          <span className="mb-3 inline-block rounded-full bg-violet-50 px-4 py-1 text-sm font-medium text-violet-600">
            Why iCareerOS
          </span>
          <h2 className="text-4xl font-bold text-gray-900">
            Everything your career needs
          </h2>
          <p className="mt-4 text-lg text-gray-500">
            Built around how careers actually work — not how job boards think they work.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-blue-100 hover:shadow-md"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-2xl transition-colors group-hover:bg-blue-100">
                {f.icon}
              </div>
              <h3 className="mb-2 text-lg font-semibold text-gray-900">{f.title}</h3>
              <p className="text-sm leading-relaxed text-gray-500">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
