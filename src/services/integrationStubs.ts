/**
 * iCareerOS — Integration Stubs (DEPRECATED)
 *
 * @deprecated Use src/services/integrations/ instead.
 *
 * These thin wrappers are kept for backwards compatibility while
 * existing callers are migrated to opportunityAggregator.searchOpportunities().
 */

import { searchLinkedIn } from "./integrations/linkedInAdapter";
import { searchIndeed }   from "./integrations/indeedAdapter";
import type { OpportunityResult, OpportunitySearchFilters } from "./opportunityTypes";

/** @deprecated Use searchLinkedIn() from src/services/integrations/ */
export async function linkedInSearchStub(
  filters: OpportunitySearchFilters
): Promise<OpportunityResult[]> {
  const result = await searchLinkedIn({ filters });
  return result.opportunities;
}

/** @deprecated Use searchIndeed() from src/services/integrations/ */
export async function indeedSearchStub(
  filters: OpportunitySearchFilters
): Promise<OpportunityResult[]> {
  const result = await searchIndeed({ filters });
  return result.opportunities;
}
