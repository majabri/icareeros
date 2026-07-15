/**
 * feat/jobs-fit-check-internal Task 3 — Deterministic outreach templates.
 *
 * ZERO LLM. Slot-filling from concrete signals: matched skills, seniority
 * fit, target-role match, candidate's own headline / current title.
 *
 * The three variants (warm_intro / value_led / referral) map to the same
 * three "variants" the LLM path returns, so the UI shape is identical
 * between modes.
 *
 * Determinism: given identical inputs, the returned strings are byte-
 * identical. Repeated use isn't identical because we rotate template
 * copies by a stable hash of the job URL — but for the same URL, the
 * same rotation is picked every time.
 */

export interface OutreachInputs {
  jobTitle:         string;
  company:          string;
  jobUrl:           string;
  candidateName?:   string;
  candidateHeadline?: string;
  candidateTopSkills?: string[];
  candidateOneGap?: string;
  recipientFirstName?: string;
}

export interface OutreachMessage {
  subject: string;
  message: string;
}

export interface OutreachVariant extends OutreachMessage {
  id: "warm_intro" | "value_led" | "referral";
  label: string;
  tone: string;
}

export interface OutreachResult {
  linkedin: OutreachMessage;
  email:    OutreachMessage;
  tips:     string[];
  variants: OutreachVariant[];
}

// FNV-1a 32-bit — cheap deterministic seed for template rotation.
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function pick<T>(items: T[], seed: number): T {
  return items[seed % items.length];
}

const LINKEDIN_TEMPLATES: Array<(x: OutreachInputs) => string> = [
  ({ recipientFirstName, jobTitle, company, candidateTopSkills }) => {
    const skills = (candidateTopSkills ?? []).slice(0, 2).filter(Boolean).join(" and ");
    const skillPart = skills ? ` My background in ${skills} maps closely to what you're looking for.` : "";
    const hi = recipientFirstName ? `Hi ${recipientFirstName}` : "Hi there";
    return `${hi} — I noticed the ${jobTitle} opening at ${company}.${skillPart} Would love to connect.`;
  },
  ({ recipientFirstName, jobTitle, company, candidateTopSkills }) => {
    const primary = (candidateTopSkills ?? []).find(Boolean);
    const hi = recipientFirstName ? `Hi ${recipientFirstName}` : "Hello";
    if (primary) {
      return `${hi}, I saw the ${jobTitle} role at ${company} and my ${primary} experience seems like a strong match. Happy to share more if useful.`;
    }
    return `${hi}, I saw the ${jobTitle} role at ${company} and think my background is a strong fit. Happy to share more if useful.`;
  },
  ({ recipientFirstName, jobTitle, company }) => {
    const hi = recipientFirstName ? `Hi ${recipientFirstName}` : "Hi";
    return `${hi} — I'm applying to the ${jobTitle} role at ${company}. If you have 10 minutes I'd love to learn what the team looks for beyond the JD.`;
  },
];

const EMAIL_TEMPLATES: Array<(x: OutreachInputs) => OutreachMessage> = [
  (x) => {
    const { recipientFirstName, jobTitle, company, candidateHeadline, candidateTopSkills, candidateOneGap } = x;
    const skills = (candidateTopSkills ?? []).slice(0, 3).filter(Boolean);
    const salutation = recipientFirstName ? `Hi ${recipientFirstName}` : "Hi";
    const skillsLine = skills.length
      ? `My background in ${joinNaturally(skills)} lines up closely with the requirements.`
      : "My background lines up closely with the requirements.";
    const gapLine = candidateOneGap
      ? `Where I'm not a 100% match: ${candidateOneGap}. Happy to talk through how I'd close that gap.`
      : "";
    const closing = "Would you be open to a 15-minute call to see if it's a fit on both sides?";
    const paras = [
      `${salutation},`,
      `I saw the ${jobTitle} role at ${company} and wanted to reach out directly.`,
      skillsLine,
      gapLine,
      closing,
      candidateHeadline ? `Best,\n${candidateHeadline}` : "Best",
    ].filter(Boolean);
    return { subject: `${jobTitle} — interested candidate`, message: paras.join("\n\n") };
  },
  (x) => {
    const { recipientFirstName, jobTitle, company, candidateHeadline, candidateTopSkills } = x;
    const primary = (candidateTopSkills ?? [])[0];
    const salutation = recipientFirstName ? `Hi ${recipientFirstName}` : "Hello";
    const openingWin = primary
      ? `Quick note — I've been leading ${primary} work that I think maps directly to what your team is scaling.`
      : `Quick note — my recent work maps directly to what your team is scaling.`;
    const paras = [
      `${salutation},`,
      openingWin,
      `The ${jobTitle} role at ${company} looks like the right next step. I'd love 15 minutes to walk through where I could contribute in the first 90 days.`,
      candidateHeadline ? `Best,\n${candidateHeadline}` : "Best",
    ];
    return { subject: `${jobTitle} at ${company}`, message: paras.join("\n\n") };
  },
  (x) => {
    const { recipientFirstName, jobTitle, company, candidateHeadline } = x;
    const salutation = recipientFirstName ? `Hi ${recipientFirstName}` : "Hi";
    const paras = [
      `${salutation},`,
      `I'm applying to the ${jobTitle} opening at ${company} and wanted to reach out ahead of hitting submit.`,
      `If you have 10 minutes and it's ok with you, I'd love to learn what the team looks for beyond the job description — it usually makes for a stronger application.`,
      candidateHeadline ? `Best,\n${candidateHeadline}` : "Best",
    ];
    return { subject: `Application for ${jobTitle} — quick question`, message: paras.join("\n\n") };
  },
];

export function generateTemplateOutreach(x: OutreachInputs): OutreachResult {
  const seed = fnv1a(x.jobUrl || `${x.company}::${x.jobTitle}`);
  const liTemplate    = pick(LINKEDIN_TEMPLATES, seed);
  const emailTemplate = pick(EMAIL_TEMPLATES, seed);

  const liNote = truncateWithEllipsis(liTemplate(x), 300);
  const email  = emailTemplate(x);

  const variants: OutreachVariant[] = [
    { id: "warm_intro", label: "Warm intro",  tone: "Friendly, curious",           ...EMAIL_TEMPLATES[0](x) },
    { id: "value_led",  label: "Value-led",   tone: "Direct, results-focused",     ...EMAIL_TEMPLATES[1](x) },
    { id: "referral",   label: "Referral ask",tone: "Polite, succinct",            ...EMAIL_TEMPLATES[2](x) },
  ];

  const tips = [
    "Personalize the recipient name — templates use a placeholder salutation",
    "Reference one specific product, blog post, or milestone from the company",
    "Send Monday-Thursday 9-11am recipient's local time for the best reply rate",
  ];

  return { linkedin: { subject: "Connection request", message: liNote }, email, tips, variants };
}

function joinNaturally(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function truncateWithEllipsis(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).replace(/\s+\S*$/, "").trimEnd() + "…";
}
