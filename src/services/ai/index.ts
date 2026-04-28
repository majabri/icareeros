/**
 * iCareerOS — AI Services barrel export
 * All 6 Career OS stage services (Evaluate → Advise → Learn → Act → Coach → Achieve)
 */

export { evaluateCareerProfile } from "./evaluateService";
export type { EvaluationResult } from "./evaluateService";

export { generateAdvice } from "./adviseService";
export type { AdviceResult, CareerPath } from "./adviseService";

export { generateLearningPlan } from "./learnService";
export type { LearnResult, LearningResource } from "./learnService";

export { triggerAction } from "./actService";
export type { ActResult, ActionType } from "./actService";

export { runCoachingSession } from "./coachService";
export type { CoachResult, CoachingFocus, InterviewPrepResult, ResumeInsights } from "./coachService";

export { recordAchievement } from "./achieveService";
export type { AchieveResult, MilestoneType } from "./achieveService";
