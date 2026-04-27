/**
 * iCareerOS — External Job Board Integration Stubs
 * LinkedIn and Indeed search stubs — to be fully implemented in Week 3.
 * Returns typed empty arrays so consumers can be wired up now.
 */

import type { OpportunityResult, OpportunitySearchFilters } from "./opportunityTypes";

/** LinkedIn Jobs search stub */
export async function linkedInSearchStub(
  _filters: OpportunitySearchFilters,
): Promise<OpportunityResult[]> {
  // TODO Week 3: Implement LinkedIn Jobs API integration
  console.warn("[integrationStubs] linkedInSearchStub not yet implemented");
  return [];
}

/** Indeed Jobs search stub */
export async function indeedSearchStub(
  _filters: OpportunitySearchFilters,
): Promise<OpportunityResult[]> {
  // TODO Week 3: Implement Indeed Publisher API integration
  console.warn("[integrationStubs] indeedSearchStub not yet implemented");
  return [];
}
