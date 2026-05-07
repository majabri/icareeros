/**
 * offerDeskService.ts
 *
 * Client-side service for the Offer Desk feature.
 * - createOffer         → INSERT into job_offers
 * - listOffers          → SELECT from job_offers
 * - updateOfferStatus   → UPDATE job_offers.status
 * - deleteOffer         → DELETE from job_offers
 * - analyzeNegotiation  → POST /api/career-os/negotiate
 */

import { createClient } from "@/lib/supabase";
import type { NegotiationResult } from "@/app/api/career-os/negotiate/route";

// ── Types ─────────────────────────────────────────────────────────────────────

export type OfferStatus = "received" | "negotiating" | "accepted" | "declined";

export interface JobOffer {
  id: string;
  user_id: string;
  company: string;
  role_title: string;
  base_salary: number | null;
  total_comp: number | null;
  equity: string | null;
  bonus: string | null;
  benefits: string | null;
  deadline: string | null;
  status: OfferStatus;
  notes: string | null;
  negotiation_result: NegotiationResult | null;
  created_at: string;
  updated_at: string;
}

export interface CreateOfferInput {
  company: string;
  role_title: string;
  base_salary?: number;
  total_comp?: number;
  equity?: string;
  bonus?: string;
  benefits?: string;
  deadline?: string;
  notes?: string;
}

export { type NegotiationResult };

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function createOffer(input: CreateOfferInput): Promise<JobOffer> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("job_offers")
    .insert({
      company: input.company,
      role_title: input.role_title,
      base_salary: input.base_salary ?? null,
      total_comp: input.total_comp ?? null,
      equity: input.equity ?? null,
      bonus: input.bonus ?? null,
      benefits: input.benefits ?? null,
      deadline: input.deadline ?? null,
      notes: input.notes ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as JobOffer;
}

export async function listOffers(): Promise<JobOffer[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("job_offers")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as JobOffer[];
}

export async function updateOfferStatus(
  id: string,
  status: OfferStatus
): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from("job_offers")
    .update({ status })
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function deleteOffer(id: string): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase.from("job_offers").delete().eq("id", id);

  if (error) throw new Error(error.message);
}

// ── Negotiation ────────────────────────────────────────────────────────────────

export async function analyzeNegotiation(opts: {
  offerId: string;
  targetSalary?: number;
  priorities?: string[];
}): Promise<NegotiationResult> {
  const res = await fetch("/api/career-os/negotiate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      offer_id: opts.offerId,
      target_salary: opts.targetSalary,
      priorities: opts.priorities,
    }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Negotiation analysis failed (${res.status})`);
  }

  return res.json() as Promise<NegotiationResult>;
}


// ── Phase 4 Item 3 — accept-offer loop trigger ──────────────────────────────

export interface AcceptOfferResult {
  newCycleId:  string;
  totalXp:     number;
  level:       number;
  milestoneId: string;
}

/**
 * POST /api/career-os/achieve/accept-offer.
 *
 * Atomic operation in a Postgres function: insert milestone (+100 XP) →
 * close active cycle → open next cycle at 'evaluate'. Idempotent — calling
 * a second time with the same offer_id returns 409.
 *
 * Returns { newCycleId, totalXp, level, milestoneId } for the celebration UI.
 */
export async function acceptOffer(offerId: string): Promise<AcceptOfferResult> {
  const res = await fetch("/api/career-os/achieve/accept-offer", {
    method:      "POST",
    headers:     { "Content-Type": "application/json" },
    credentials: "include",
    body:        JSON.stringify({ offer_id: offerId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error("acceptOffer failed: " + (err.error ?? res.statusText));
  }
  return (await res.json()) as AcceptOfferResult;
}
