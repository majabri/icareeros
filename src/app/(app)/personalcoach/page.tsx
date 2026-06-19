import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Personal Coach — iCareerOS",
};

/**
 * /personalcoach — Personal Coaching directory.
 *
 * 2026-06-18 (feat/jobs-personal-coach) — surface for booking sessions
 * with vetted human career coaches. Sits alongside the AI Coach (/aicoach)
 * under the Advise stage.
 *
 * Booking URLs are intentionally placeholders ('#') in v1 — Amir will fill
 * them with each coach's real scheduling page (Calendly, SavvyCal, etc.)
 * before public launch. The disabled-when-unavailable button + 'Currently
 * Unavailable' badge is the standing pattern for coaches at capacity.
 */

interface Coach {
  id:          number;
  name:        string;
  title:       string;
  initials:    string;
  color:       string;
  specialties: string[];
  rate:        string;
  format:      string;
  experience:  string;
  bookingUrl:  string;
  available:   boolean;
}

const COACHES: Coach[] = [
  {
    id: 1,
    name: "Sarah Mitchell",
    title: "Senior Career Coach",
    initials: "SM",
    color: "#00B8A9",
    specialties: ["Career Transitions", "Executive Presence", "Tech Industry"],
    rate: "$150 / session",
    format: "Video · 60 min",
    experience: "12 years · Former Google HR",
    bookingUrl: "#",
    available: true,
  },
  {
    id: 2,
    name: "James Okafor",
    title: "Leadership & Career Strategist",
    initials: "JO",
    color: "#FF6B6B",
    specialties: ["Leadership Development", "Salary Negotiation", "Finance & Consulting"],
    rate: "$175 / session",
    format: "Video · 45 min",
    experience: "8 years · Former McKinsey",
    bookingUrl: "#",
    available: true,
  },
  {
    id: 3,
    name: "Priya Sharma",
    title: "Career Pivot Specialist",
    initials: "PS",
    color: "#F5A623",
    specialties: ["Career Change", "Resume Strategy", "Interview Coaching"],
    rate: "$125 / session",
    format: "Video or Chat · 60 min",
    experience: "6 years · ICF Certified",
    bookingUrl: "#",
    available: false,
  },
];

const ADVISE_CORAL = "#FF6B6B";   // Advise stage accent
const DARK_PANEL   = "#162338";
const DARK_BORDER  = "#1F2E48";
const SLATE_BLUE   = "#7B9AC0";
const TEAL_PRIMARY = "#00B8A9";

export default function PersonalCoachPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* Header */}
      <header className="mb-6">
        <span
          className="text-[10px] font-bold uppercase tracking-widest"
          style={{ color: ADVISE_CORAL }}
        >
          Stage 2 · Advise
        </span>
        <h2 className="mt-1 text-2xl sm:text-3xl font-black tracking-tight text-gray-900">
          Personal Coach
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-gray-600">
          Work with a certified human career coach to accelerate your career growth.
        </p>
      </header>

      {/* Intro banner */}
      <div
        className="mb-6 rounded-xl border px-4 py-3 text-sm text-gray-700"
        style={{
          background: "rgba(0,184,169,0.06)",
          borderColor: "rgba(0,184,169,0.25)",
        }}
        role="note"
      >
        <strong className="font-semibold" style={{ color: TEAL_PRIMARY }}>
          All coaches are vetted 3rd-party professionals.
        </strong>{" "}
        Sessions are booked directly with your coach.
      </div>

      {/* Coach grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {COACHES.map((coach) => (
          <article
            key={coach.id}
            className="flex flex-col gap-3 rounded-2xl border p-5 shadow-sm"
            style={{
              background: DARK_PANEL,
              borderColor: DARK_BORDER,
            }}
          >
            {/* Header row: avatar + name + title */}
            <div className="flex items-center gap-3">
              <div
                aria-hidden="true"
                className="grid h-12 w-12 shrink-0 place-items-center rounded-full font-bold text-white"
                style={{
                  background: coach.color,
                  letterSpacing: "0.02em",
                  fontSize: "0.95rem",
                }}
              >
                {coach.initials}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-bold text-white">
                  {coach.name}
                </h3>
                <p className="truncate text-xs" style={{ color: SLATE_BLUE }}>
                  {coach.title}
                </p>
              </div>
            </div>

            {/* Specialties */}
            <ul className="flex flex-wrap gap-1.5">
              {coach.specialties.map((s, i) => (
                <li
                  key={i}
                  className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                  style={{
                    color: TEAL_PRIMARY,
                    border: `1px solid ${TEAL_PRIMARY}55`,
                    background: "rgba(0,184,169,0.06)",
                  }}
                >
                  {s}
                </li>
              ))}
            </ul>

            {/* Rate */}
            <p className="text-sm font-semibold text-white">
              {coach.rate}
            </p>

            {/* Format + experience */}
            <div className="space-y-0.5 text-[12px]" style={{ color: SLATE_BLUE }}>
              <p>{coach.format}</p>
              <p>{coach.experience}</p>
            </div>

            {/* Book a Session button */}
            <div className="mt-1">
              {coach.available ? (
                <a
                  href={coach.bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
                  style={{ background: TEAL_PRIMARY }}
                >
                  Book a Session
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  className="inline-flex w-full cursor-not-allowed items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold text-gray-300"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: `1px solid ${DARK_BORDER}`,
                  }}
                >
                  Currently Unavailable
                </button>
              )}
            </div>

            {/* Free intro call */}
            <p
              className="text-center text-[11px]"
              style={{ color: SLATE_BLUE }}
            >
              Free 15-min intro call available
            </p>
          </article>
        ))}
      </div>

      {/* Join-network CTA */}
      <section
        className="mt-10 rounded-2xl border border-gray-200 bg-gray-50 px-6 py-5 text-center"
      >
        <h3 className="text-sm font-bold text-gray-900">
          Are you a career coach?
        </h3>
        <p className="mt-1 text-sm text-gray-600">
          Join our network of vetted professionals helping iCareerOS users grow.
        </p>
        <a
          href="mailto:coaches@icareeros.com?subject=Join%20the%20iCareerOS%20coach%20network"
          className="mt-3 inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
        >
          Email coaches@icareeros.com
        </a>
      </section>
    </div>
  );
}
