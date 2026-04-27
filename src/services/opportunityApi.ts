/**
 * iCareerOS — Opportunity Service API layer.
 * Public interface for all job/opportunity operations.
 * Adapted from azjobs/src/services/job/api.ts.
 *
 * All consumers import from here — no cross-service imports.
 * Renamed: jobApi → opportunityApi, Job → Opportunity throughout.
 */

// Core search & matching
export {
  searchOpportunities,
  searchDatabaseOpportunities,
  searchAIOpportunities,
  normalizeOpportunityUrl,
  pollMatchScores,
  markOpportunityInteraction,
} from "./opportunityService";

export type {
  OpportunityResult,
  OpportunitySearchFilters,
  ParsedJobDescription,
  DiscoverOpportunitiesResponse,
} from "./opportunityTypes";

// LinkedIn / Indeed stubs — to be implemented in Week 3
export { linkedInSearchStub, indeedSearchStub } from "./integrationStubs";
