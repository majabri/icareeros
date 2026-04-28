/**
 * iCareerOS — AI Services index
 * Public exports for all 3 core AI stage services.
 */
export { evaluateCareerProfile } from "./evaluateService";
export type { EvaluationResult } from "./evaluateService";

export { generateAdvice } from "./adviseService";
export type { AdviceResult, CareerPath } from "./adviseService";

export { triggerAction } from "./actService";
export type { ActResult, ActionType } from "./actService";
