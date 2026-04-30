/**
 * iCareerOS — i18n type definitions
 *
 * Translation keys are typed so typos are caught at compile time.
 * Add new keys to the `Translations` interface; TypeScript will enforce
 * that every locale file implements them.
 */

export type Locale = "en" | "es" | "fr" | "de";

export const SUPPORTED_LOCALES: Locale[] = ["en", "es", "fr", "de"];
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
};

export interface Translations {
  // ── Navigation ────────────────────────────────────────────────────
  nav: {
    careerOS: string;
    opportunities: string;
    interview: string;
    resume: string;
    offers: string;
    support: string;
    billing: string;
    profile: string;
    signOut: string;
  };

  // ── Landing page ──────────────────────────────────────────────────
  landing: {
    heroHeadline: string;
    heroSubheadline: string;
    heroCta: string;
    heroSecondaryCta: string;
    featuresTitle: string;
    feature1Title: string;
    feature1Desc: string;
    feature2Title: string;
    feature2Desc: string;
    feature3Title: string;
    feature3Desc: string;
    feature4Title: string;
    feature4Desc: string;
    feature5Title: string;
    feature5Desc: string;
    feature6Title: string;
    feature6Desc: string;
    cycleTitle: string;
    cycleDesc: string;
    statsUsers: string;
    statsJobs: string;
    statsMatches: string;
    statsOffers: string;
    ctaTitle: string;
    ctaDesc: string;
    ctaButton: string;
  };

  // ── Dashboard ─────────────────────────────────────────────────────
  dashboard: {
    title: string;
    subtitle: string;
    cycleProgress: string;
    currentStage: string;
    noActiveCycle: string;
    startCycle: string;
    stages: {
      evaluate: string;
      advise: string;
      learn: string;
      act: string;
      coach: string;
      achieve: string;
    };
  };

  // ── Jobs ──────────────────────────────────────────────────────────
  jobs: {
    title: string;
    subtitle: string;
    searchPlaceholder: string;
    searchButton: string;
    noResults: string;
    loading: string;
    fitScore: string;
    salary: string;
    salaryNotListed: string;
    remote: string;
    applyNow: string;
    coverLetter: string;
    outreach: string;
  };

  // ── Auth ──────────────────────────────────────────────────────────
  auth: {
    signIn: string;
    signUp: string;
    email: string;
    password: string;
    noAccount: string;
    hasAccount: string;
    signingIn: string;
    signingUp: string;
  };

  // ── Common ────────────────────────────────────────────────────────
  common: {
    save: string;
    saving: string;
    saved: string;
    cancel: string;
    delete: string;
    loading: string;
    error: string;
    success: string;
    back: string;
    next: string;
    submit: string;
    submitting: string;
    download: string;
    copy: string;
    copied: string;
    close: string;
    open: string;
    edit: string;
    view: string;
    new: string;
    or: string;
  };

  // ── Support ───────────────────────────────────────────────────────
  support: {
    title: string;
    subtitle: string;
    submitTicket: string;
    subjectLabel: string;
    subjectPlaceholder: string;
    bodyLabel: string;
    bodyPlaceholder: string;
    priorityLabel: string;
    submitButton: string;
    successMessage: string;
    myTickets: string;
    noTickets: string;
  };

  // ── Settings ──────────────────────────────────────────────────────
  settings: {
    title: string;
    billing: string;
    emailPrefs: string;
    account: string;
    exportData: string;
    exportDesc: string;
    exportButton: string;
    dangerZone: string;
    deleteAccount: string;
    deleteDesc: string;
  };
}
