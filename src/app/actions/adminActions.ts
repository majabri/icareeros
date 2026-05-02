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

/**
 * Permanently delete a user via Supabase Admin API.
 * Cascades to user_subscriptions and any FK-referencing tables.
 * Refuses if userId matches the calling admin (self-delete lockout protection).
 *
 * Cascade behavior verified 2026-05-02: auth.admin.deleteUser() removes the auth.users
 * row, which CASCADEs to user_subscriptions. user_profiles, career_os_cycles,
 * career_os_stages, email_preferences, and other FK tables follow ON DELETE CASCADE
 * configured in their foreign-key constraints.
 */
export async function deleteUser(userId: string): Promise<{ error?: string }> {
  // Self-delete guard — prevents admin lockout
  const { cookies } = await import("next/headers");
  const { createServerClient } = await import("@supabase/ssr");
  const cookieStore = await cookies();
  const ssr = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() { /* readonly inside server action */ },
      },
    }
  );
  const { data: { user } } = await ssr.auth.getUser();
  if (user?.id === userId) {
    return { error: "Cannot delete your own admin account" };
  }

  const svc = makeSvc();
  const { error } = await svc.auth.admin.deleteUser(userId);
  if (error) return { error: error.message };
  revalidatePath("/admin/users");
  return {};
}
