/**
 * GET /api/stripe/founding-status
 *
 * Public read of the founding lifetime seat counter so the marketing UI can
 * show "X seats remaining" or hide the offer entirely.
 *
 * No auth required — the count is non-sensitive.
 *
 * Responses:
 *   200 { available: boolean, seatsRemaining: number }
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  // Use the anon client; the public read RLS on feature_flags allows it.
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  const { data } = await sb
    .from("feature_flags")
    .select("value, enabled")
    .eq("key", "founding_seats_remaining")
    .maybeSingle();

  const seats = (data?.value as number | null) ?? 0;
  const available = Boolean(data?.enabled) && seats > 0;
  return NextResponse.json({ available, seatsRemaining: seats }, { status: 200 });
}
