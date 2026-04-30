"use server";

import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

/**
 * Reset a user's subscription plan back to 'free'.
 * Admin-only — caller should verify admin identity before invoking.
 */
export async function resetUserPlan(userId: string): Promise<{ error?: string }> {
  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await svc
    .from("user_subscriptions")
    .update({ plan: "free", status: "active", updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  if (error) return { error: error.message };
  revalidatePath("/admin");
  return {};
}
