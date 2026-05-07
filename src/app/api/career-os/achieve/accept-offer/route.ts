/**
 * POST /api/career-os/achieve/accept-offer
 *
 * Phase 4 Item 3 — Career OS loop trigger.
 *
 * When the user marks a job_offers row as accepted in the Offer Desk, this
 * endpoint executes the atomic 3-step operation via a Postgres function:
 *   1. Insert milestones row (type='offer_accepted', xp_awarded=100)
 *   2. Mark the active career_os_cycles row as completed
 *   3. Insert a new career_os_cycles row at current_stage='evaluate'
 *
 * Idempotent: calling twice with the same offer_id returns 409.
 *
 * The Postgres function (`public.complete_cycle_and_start_next`) holds the
 * transaction. This route just authenticates, validates the body, updates
 * the offer's status, and dispatches the RPC. No LLM call → no Langfuse
 * tracing here.
 */

import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

interface PostBody {
  offer_id?: string;
}

interface RpcResult {
  newCycleId:  string;
  totalXp:     number;
  level:       number;
  milestoneId: string;
}

async function makeSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
          catch { /* server component */ }
        },
      },
    },
  );
}

export async function POST(req: Request) {
  try {
    const supabase = await makeSupabaseServer();

    // 1. Auth
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Body
    const body = (await req.json().catch(() => ({}))) as PostBody;
    const offerId = body?.offer_id;
    if (!offerId || typeof offerId !== "string") {
      return NextResponse.json({ error: "offer_id is required" }, { status: 400 });
    }

    // 3. Look up the offer + verify ownership (RLS will also enforce).
    //    Compose a short summary for the milestone description.
    const { data: offer, error: offerErr } = await supabase
      .from("job_offers")
      .select("id, role_title, company, status")
      .eq("id", offerId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (offerErr) {
      return NextResponse.json({ error: offerErr.message }, { status: 500 });
    }
    if (!offer) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 });
    }

    const summary = `${offer.role_title} at ${offer.company}`;

    // 4. Update the offer's own status (idempotent — does the right thing
    //    even if already 'accepted')
    if (offer.status !== "accepted") {
      const { error: updErr } = await supabase
        .from("job_offers")
        .update({ status: "accepted", updated_at: new Date().toISOString() })
        .eq("id", offerId)
        .eq("user_id", user.id);
      if (updErr) {
        return NextResponse.json({ error: updErr.message }, { status: 500 });
      }
    }

    // 5. Dispatch the atomic loop trigger
    const { data: rpcData, error: rpcErr } = await supabase.rpc(
      "complete_cycle_and_start_next",
      {
        p_user_id:       user.id,
        p_offer_id:      offerId,
        p_offer_summary: summary,
      },
    );

    if (rpcErr) {
      // Postgres function raises distinct ERRCODEs:
      //   P0001 → offer not found / not owned (already handled above by 404)
      //   P0002 → idempotency hit — already processed
      //   P0003 → no active cycle to complete
      const msg = rpcErr.message ?? "RPC failed";
      if (msg.includes("Offer already processed")) {
        return NextResponse.json({ error: "Offer already processed" }, { status: 409 });
      }
      if (msg.includes("No active cycle")) {
        return NextResponse.json({ error: "No active cycle to complete" }, { status: 409 });
      }
      console.error("[accept-offer] rpc error:", msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    return NextResponse.json(rpcData as RpcResult);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[accept-offer] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
