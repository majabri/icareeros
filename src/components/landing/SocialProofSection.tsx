const STATS = [
  { value: "50,000+", label: "Career Seekers" },
  { value: "4.9/5",   label: "Average Rating" },
  { value: "87%",     label: "Land Interviews Faster" },
  { value: "3.2×",    label: "Avg Salary Increase" },
];

export function SocialProofSection() {
  return (
    <section className="border-y py-16" style={{ borderColor: "var(--border-theme)", background: "var(--bg-surface)" }}>
      <div className="mx-auto max-w-5xl px-6">
        <p className="mb-10 text-center text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
          Trusted by professionals across every industry
        </p>

        <div className="mb-14 grid grid-cols-2 gap-6 md:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-brand-gradient text-4xl font-black uppercase tracking-tight">{s.value}</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Testimonial */}
        <div className="glass-strong mx-auto max-w-2xl rounded-2xl p-8 text-center">
          <div className="mb-4 flex justify-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <svg key={i} className="h-4 w-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 00.95.69h4.163c.969 0 1.372 1.24.588 1.81l-3.37 2.448a1 1 0 00-.364 1.118l1.287 3.957c.3.921-.755 1.688-1.54 1.118l-3.37-2.448a1 1 0 00-1.175 0l-3.37 2.448c-.784.57-1.838-.197-1.54-1.118l1.287-3.957a1 1 0 00-.364-1.118L2.062 9.384c-.784-.57-.38-1.81.588-1.81h4.163a1 1 0 00.95-.69L9.049 2.927z" />
              </svg>
            ))}
          </div>
          <blockquote className="mb-5 text-lg font-medium leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            &ldquo;iCareerOS didn&rsquo;t just help me find a job — it helped me understand my entire career
            trajectory. Within 3 months I landed a senior role with a 40% salary increase.&rdquo;
          </blockquote>
          <div className="flex items-center justify-center gap-3">
            <div className="bg-brand-gradient flex h-10 w-10 items-center justify-center rounded-full text-xs font-black text-black">SM</div>
            <div className="text-left">
              <p className="text-sm font-bold text-white">Sarah M.</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Software Engineer → Senior Product Manager</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
