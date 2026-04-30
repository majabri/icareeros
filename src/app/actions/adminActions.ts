"use server";

import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

function makeSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Reset a user's subscription plan back to 'free'.
 * Admin-only — caller should verify admin identity before invoking.
 */
export async function resetUserPlan(userId: string): Promise<{ error?: string }> {
  const svc = makeSvc();
  const { error } = await svc
    .from("user_subscriptions")
    .update({ plan: "free", status: "active", updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) return { error: error.message };
  revalidatePath("/admin");
  return {};
}

/**
 * Confirm a user's email address via the Supabase Admin API.
 * Equivalent to checking "Email confirmed" in the Supabase dashboard.
 * Idempotent — safe to call on already-confirmed users.
 */
export async function confirmUserEmail(userId: string): Promise<{ error?: string }> {
  const svc = makeSvc();
  const { error } = await svc.auth.admin.updateUserById(userId, {
    email_confirm: true,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin");
  return {};
}

/**
 * Update a support ticket's status.
 * Admin-only — uses service-role to bypass RLS.
 */
export async function updateTicketStatus(
  ticketId: string,
  status: "open" | "in_progress" | "resolved" | "closed"
): Promise<{ error?: string }> {
  const svc = makeSvc();
  const { error } = await svc
    .from("support_tickets")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", ticketId);
  if (error) return { error: error.message };
  revalidatePath("/admin/tickets");
  return {};
}
