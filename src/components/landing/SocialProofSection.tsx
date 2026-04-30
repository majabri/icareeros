export function SocialProofSection() {
  const stats = [
    { value: "50,000+", label: "Career Seekers" },
    { value: "4.9/5", label: "Average Rating" },
    { value: "87%", label: "Land Interviews Faster" },
    { value: "3.2×", label: "Avg Salary Increase" },
  ];

  return (
    <section className="border-y border-gray-100 bg-white py-14">
      <div className="mx-auto max-w-5xl px-6">
        {/* Trust bar */}
        <p className="mb-10 text-center text-sm font-semibold uppercase tracking-widest text-gray-400">
          Trusted by professionals across every industry
        </p>

        {/* Stats row */}
        <div className="mb-12 grid grid-cols-2 gap-6 md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <p
                className="text-4xl font-extrabold tracking-tight"
                style={{ background: "linear-gradient(135deg,#00d9ff,#4ecdc4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
              >
                {s.value}
              </p>
              <p className="mt-1 text-sm text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Featured testimonial */}
        <div className="mx-auto max-w-2xl rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-50 to-teal-50 p-8 text-center shadow-sm">
          <div className="mb-4 flex justify-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <svg key={i} className="h-5 w-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 00.95.69h4.163c.969 0 1.372 1.24.588 1.81l-3.37 2.448a1 1 0 00-.364 1.118l1.287 3.957c.3.921-.755 1.688-1.54 1.118l-3.37-2.448a1 1 0 00-1.175 0l-3.37 2.448c-.784.57-1.838-.197-1.54-1.118l1.287-3.957a1 1 0 00-.364-1.118L2.062 9.384c-.784-.57-.38-1.81.588-1.81h4.163a1 1 0 00.95-.69L9.049 2.927z" />
              </svg>
            ))}
          </div>
          <blockquote className="mb-4 text-lg font-medium leading-relaxed text-gray-700">
            &ldquo;iCareerOS didn&rsquo;t just help me find a job — it helped me understand my entire career
            trajectory. Within 3 months I landed a senior role with a 40% salary increase.&rdquo;
          </blockquote>
          <div className="flex items-center justify-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: "linear-gradient(135deg,#00d9ff,#4ecdc4)" }}>
              SM
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-800">Sarah M.</p>
              <p className="text-xs text-gray-500">Software Engineer → Senior Product Manager</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
