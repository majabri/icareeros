/**
 * iCareerOS — Opportunity Service Types
 * Data contracts for the opportunity search and analysis domain.
 * Adapted from azjobs/src/services/job/types.ts.
 * Renamed: Job → Opportunity, job → opportunity throughout.
 */

export interface OpportunityResult {
  id?: string;
  title: string;
  company: string;
  location: string;
  type: string;
  description: string;
  url: string;
  matchReason: string;
  quality_score?: number;
  is_flagged?: boolean;
  flag_reasons?: string[];
  salary?: string;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  seniority?: string;
  is_remote?: boolean;
  source?: string;
  first_seen_at?: string;

  // AI match fields (from user_opportunity_matches)
  fit_score?: number | null;
  matched_skills?: string[];
  skill_gaps?: string[];
  strengths?: string[];
  red_flags?: string[];
  match_summary?: string;
  effort_level?: "easy" | "moderate" | "hard";
  response_prob?: number | null;
  smart_tag?: string;
  is_saved?: boolean;
  is_applied?: boolean;

  // Local scoring fields (computed client-side when AI scores unavailable)
  responseProbability?: number;
  smartTag?: string;
  decisionScore?: number;
  effortEstimate?: number;
  trustScore?: number;
  trustLevel?: "trusted" | "caution" | "risky";
  strategy?: "apply_now" | "apply_fast" | "improve_first" | "skip";
}

export interface OpportunitySearchFilters {
  skills: string[];
  jobTypes: string[];
  location: string;
  query: string;
  careerLevel: string;
  targetTitles: string[];
  salaryMin?: string;
  salaryMax?: string;
  searchSource: "all" | "ai" | "database";
  minFitScore: number;
  showFlagged: boolean;
  search_mode?: "quality" | "balanced" | "volume";
  days_old?: number;
  offset?: number;
}

export interface ParsedJobDescription {
  requirementsText: string;
  benefitsText: string;
  companyText: string;
  fullText: string;
}

export interface DiscoverOpportunitiesResponse {
  opportunities: OpportunityResult[];
  total: number;
  searchTerm: string;
  matchingTriggered: boolean;
  source: string;
}
