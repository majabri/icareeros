"use server";

import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

function makeSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export type UserRole = "user" | "moderator" | "admin";
export type SubscriptionPlan = "free" | "pro" | "premium";

/**
 * Set a user's subscription plan (upgrade or downgrade).
 */
export async function setUserPlan(
  userId: string,
  plan: SubscriptionPlan
): Promise<{ error?: string }> {
  const svc = makeSvc();
  const { error } = await svc
    .from("user_subscriptions")
    .update({ plan, status: "active", updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) return { error: error.message };
  revalidatePath("/admin/users");
  return {};
}

/**
 * @deprecated Use setUserPlan instead.
 */
export async function resetUserPlan(userId: string): Promise<{ error?: string }> {
  return setUserPlan(userId, "free");
}

/**
 * Set a user's role (user | moderator | admin).
 */
export async function setUserRole(
  userId: string,
  role: UserRole
): Promise<{ error?: string }> {
  const svc = makeSvc();
  const { error } = await svc
    .from("profiles")
    .update({ role, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) return { error: error.message };
  revalidatePath("/admin/users");
  return {};
}

/**
 * Confirm a user's email address via the Supabase Admin API.
 */
export async function confirmUserEmail(userId: string): Promise<{ error?: string }> {
  const svc = makeSvc();
  const { error } = await svc.auth.admin.updateUserById(userId, {
    email_confirm: true,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/users");
  return {};
}

/**
 * Update a support ticket's status.
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
