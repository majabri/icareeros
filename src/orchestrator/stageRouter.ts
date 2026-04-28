/**
 * iCareerOS — Stage Router
 * Routes each Career OS stage to the appropriate AI service.
 * All stage handlers are async and return a typed result.
 */

import type { CareerOsStage } from "./careerOsOrchestrator";

export interface RouteResult {
  success: boolean;
  meta?: Record<string, unknown>;
  error?: string;
}

async function routeEvaluate(userId: string, cycleId: string): Promise<RouteResult> {
  // Week 3: wire to evaluateService.evaluateCareerProfile(userId)
  console.info(`[stageRouter] evaluate — userId=${userId} cycleId=${cycleId}`);
  return { success: true, meta: { stage: "evaluate", stub: true } };
}

async function routeAdvise(userId: string, cycleId: string): Promise<RouteResult> {
  // Week 3: wire to adviseService.generateAdvice(userId, evaluationResult)
  console.info(`[stageRouter] advise — userId=${userId} cycleId=${cycleId}`);
  return { success: true, meta: { stage: "advise", stub: true } };
}

async function routeLearn(userId: string, cycleId: string): Promise<RouteResult> {
  // Week 3: wire to learning recommendations edge fn
  console.info(`[stageRouter] learn — userId=${userId} cycleId=${cycleId}`);
  return { success: true, meta: { stage: "learn", stub: true } };
}

async function routeAct(userId: string, cycleId: string): Promise<RouteResult> {
  // Week 3: wire to actService.triggerAction(userId, action)
  console.info(`[stageRouter] act — userId=${userId} cycleId=${cycleId}`);
  return { success: true, meta: { stage: "act", stub: true } };
}

async function routeCoach(userId: string, cycleId: string): Promise<RouteResult> {
  // Week 3: wire to coach feedback edge fn (interview prep, resume tweaks)
  console.info(`[stageRouter] coach — userId=${userId} cycleId=${cycleId}`);
  return { success: true, meta: { stage: "coach", stub: true } };
}

async function routeAchieve(userId: string, cycleId: string): Promise<RouteResult> {
  // Week 3: wire to milestone recording + notification
  console.info(`[stageRouter] achieve — userId=${userId} cycleId=${cycleId}`);
  return { success: true, meta: { stage: "achieve", stub: true } };
}

const handlers: Record<CareerOsStage, (u: string, c: string) => Promise<RouteResult>> = {
  evaluate: routeEvaluate,
  advise:   routeAdvise,
  learn:    routeLearn,
  act:      routeAct,
  coach:    routeCoach,
  achieve:  routeAchieve,
};

export const stageRouter = {
  async route(userId: string, cycleId: string, stage: CareerOsStage): Promise<RouteResult> {
    const handler = handlers[stage];
    if (!handler) {
      return { success: false, error: `Unknown stage: ${stage}` };
    }
    try {
      return await handler(userId, cycleId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  },
};
