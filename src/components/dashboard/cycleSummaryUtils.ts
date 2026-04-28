import type { AchieveResult } from "@/services/ai/achieveService";

/** Pick the highest-priority next-cycle focus from achieve recommendations */
export function pickNextCycleFocus(
  recommendations: AchieveResult["nextCycleRecommendations"] | undefined,
): string | undefined {
  if (!recommendations || recommendations.length === 0) return undefined;
  return (
    recommendations.find((r) => r.priority === "high")?.focus ??
    recommendations[0]?.focus
  );
}
