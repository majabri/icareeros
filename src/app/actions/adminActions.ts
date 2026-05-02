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

// ─────────────────────────────────────────────────────────────────────────────
// Bulk variants — Phase 2 (added 2026-05-02)
// All return per-user partial-failure shape so the UI can surface failed rows.
// All apply self-protection where the operation could lock out the calling admin.
// ─────────────────────────────────────────────────────────────────────────────

type BulkResult = {
  succeeded: string[];
  failed: { userId: string; error: string }[];
};

async function getCurrentAdminUserId(): Promise<string | null> {
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
  return user?.id ?? null;
}

/**
 * Bulk delete users. Self-protection: silently filters out the calling admin's id.
 */
export async function deleteUsers(userIds: string[]): Promise<BulkResult> {
  const callerId = await getCurrentAdminUserId();
  const targets = userIds.filter((id) => id !== callerId);
  const svc = makeSvc();
  const result: BulkResult = { succeeded: [], failed: [] };

  for (const id of targets) {
    const { error } = await svc.auth.admin.deleteUser(id);
    if (error) {
      result.failed.push({ userId: id, error: error.message });
    } else {
      result.succeeded.push(id);
    }
  }

  // Surface filtered self-target as a "failed" row so the UI can explain why
  if (callerId && userIds.includes(callerId)) {
    result.failed.push({
      userId: callerId,
      error: "Cannot delete your own admin account (self-protection)",
    });
  }

  revalidatePath("/admin/users");
  return result;
}

/**
 * Bulk plan change.
 */
export async function setUsersPlan(
  userIds: string[],
  plan: SubscriptionPlan
): Promise<BulkResult> {
  const svc = makeSvc();
  const result: BulkResult = { succeeded: [], failed: [] };

  for (const id of userIds) {
    const { error } = await svc
      .from("user_subscriptions")
      .update({ plan, status: "active", updated_at: new Date().toISOString() })
      .eq("user_id", id);
    if (error) {
      result.failed.push({ userId: id, error: error.message });
    } else {
      result.succeeded.push(id);
    }
  }

  revalidatePath("/admin/users");
  return result;
}

/**
 * Bulk role change. Self-protection: refuses to demote the calling admin to "user".
 */
export async function setUsersRole(
  userIds: string[],
  role: UserRole
): Promise<BulkResult> {
  const callerId = await getCurrentAdminUserId();
  const result: BulkResult = { succeeded: [], failed: [] };

  // If demoting to "user", filter out caller to prevent self-demotion lockout
  const targets =
    role === "user" && callerId
      ? userIds.filter((id) => id !== callerId)
      : userIds;

  const svc = makeSvc();
  for (const id of targets) {
    const { error } = await svc
      .from("profiles")
      .update({ role, updated_at: new Date().toISOString() })
      .eq("user_id", id);
    if (error) {
      result.failed.push({ userId: id, error: error.message });
    } else {
      result.succeeded.push(id);
    }
  }

  if (
    role === "user" &&
    callerId &&
    userIds.includes(callerId)
  ) {
    result.failed.push({
      userId: callerId,
      error: "Cannot demote your own admin account to user (self-protection)",
    });
  }

  revalidatePath("/admin/users");
  return result;
}
