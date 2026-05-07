/**
 * Milestone client helpers for the Achieve stage.
 *
 * Phase 4 Item 3 — see docs/specs/COWORK-BRIEF-phase4-v1.md.
 *
 * Reads from the (extended) public.milestones table directly via Supabase
 * REST. RLS enforces ownership. No corresponding API route — these are
 * pure read paths.
 */

import { createClient } from "@/lib/supabase";

export type MilestoneType =
  | "offer_accepted"
  | "promotion"
  | "certification"
  | "cycle_complete"
  | "manual";

export interface Milestone {
  id:          string;
  user_id:     string;
  cycle_id:    string | null;
  type:        MilestoneType;
  title:       string;
  description: string | null;
  achieved_at: string;
  xp_awarded:  number;
  metadata:    Record<string, unknown> | null;
  created_at:  string;
}

export interface CareerXp {
  totalXp:           number;
  level:             number;
  recentMilestones:  Milestone[];
}

/**
 * Computes total XP + level (base 1, every 500 XP = 1 level up).
 * Pure helper — exported so tests can verify the math.
 */
export function levelForXp(totalXp: number): number {
  if (totalXp < 0) return 1;
  return Math.floor(totalXp / 500) + 1;
}

/** Last 20 milestones, newest first. */
export async function listMilestones(): Promise<Milestone[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("milestones")
    .select("id, user_id, cycle_id, type, title, description, achieved_at, xp_awarded, metadata, created_at")
    .order("achieved_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []) as Milestone[];
}

/** Aggregate the user's XP + level + last 5 milestones for dashboard render. */
export async function getCareerXp(): Promise<CareerXp> {
  const milestones = await listMilestones();
  const totalXp    = milestones.reduce((sum, m) => sum + (m.xp_awarded ?? 0), 0);
  return {
    totalXp,
    level:            levelForXp(totalXp),
    recentMilestones: milestones.slice(0, 5),
  };
}
