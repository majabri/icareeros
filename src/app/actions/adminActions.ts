"use server";

import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import type { AdminRole, AdminContext } from "@/lib/admin/permissions";
import { logAdminAction } from "@/lib/admin/audit";

function makeSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ─── Admin authorization — checks profiles.role in the DB ───────────────────
// Single source of truth: public.profiles.role. Roles are managed via the
// /admin/users UsersAdminPanel (promote/demote actions). New signups default
// to role='user'; only existing admins can change roles.
//
// Defense in depth: middleware.ts and src/app/(admin)/admin/layout.tsx do
// the same check at the page layer; this re-check runs in every server
// action because actions can be invoked directly by anyone who knows the
// action ID.

type RequireAdminResult = (AdminContext & { id: string }) | { error: string };

async function requireAdmin(): Promise<RequireAdminResult> {
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
  if (!user) return { error: "Not authenticated" };

  // Service-role to bypass profile RLS.
  const svc = makeSvc();
  const { data: profile } = await svc
    .from("profiles")
    .select("role, admin_role")
    .eq("user_id", user.id)
    .maybeSingle();

  // Sprint 4 W3-B: resolve effective admin_role for audit logging.
  // Explicit admin_role wins. Legacy role='admin' falls back to super_admin.
  let admin_role: AdminRole | null = null;
  if (profile?.admin_role && ["super_admin","admin","support_l2","support_l1","viewer"].includes(profile.admin_role)) {
    admin_role = profile.admin_role as AdminRole;
  } else if (profile?.role === "admin") {
    admin_role = "super_admin";
  }
  if (!admin_role) return { error: "Forbidden — admin access required" };

  return {
    id: user.id,
    user_id: user.id,
    email: user.email ?? "",
    admin_role,
  };
}

/** Build an AdminContext for logAdminAction from a successful requireAdmin() result. */
function ctxOf(auth: Exclude<RequireAdminResult, { error: string }>): AdminContext {
  return { user_id: auth.user_id, email: auth.email, admin_role: auth.admin_role };
}

export type UserRole = "user" | "moderator" | "admin";
export type SubscriptionPlan = "free" | "starter" | "standard" | "pro";

/**
 * Set a user's subscription plan (upgrade or downgrade).
 */
export async function setUserPlan(
  userId: string,
  plan: SubscriptionPlan
): Promise<{ error?: string }> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  const svc = makeSvc();
  const { data: before } = await svc
    .from("user_subscriptions").select("plan, status").eq("user_id", userId).maybeSingle();
  const { error } = await svc
    .from("user_subscriptions")
    .update({ plan, status: "active", updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) return { error: error.message };
  await logAdminAction({
    ctx: ctxOf(auth), action: "users.plan_changed",
    target_table: "user_subscriptions", target_id: userId,
    before_value: before ?? null,
    after_value: { plan, status: "active" },
  });
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
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  const svc = makeSvc();
  const { data: before } = await svc
    .from("profiles").select("role").eq("user_id", userId).maybeSingle();
  const { error } = await svc
    .from("profiles")
    .update({ role, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) return { error: error.message };
  await logAdminAction({
    ctx: ctxOf(auth), action: "users.role_changed",
    target_table: "profiles", target_id: userId,
    before_value: { role: before?.role ?? null },
    after_value: { role },
  });
  revalidatePath("/admin/users");
  return {};
}

/**
 * Confirm a user's email address via the Supabase Admin API.
 */
export async function confirmUserEmail(userId: string): Promise<{ error?: string }> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  const svc = makeSvc();
  const { error } = await svc.auth.admin.updateUserById(userId, {
    email_confirm: true,
  });
  if (error) return { error: error.message };
  await logAdminAction({
    ctx: ctxOf(auth), action: "users.email_confirmed",
    target_table: "auth.users", target_id: userId,
    after_value: { email_confirmed_at: new Date().toISOString() },
  });
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
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  const svc = makeSvc();
  const { data: before } = await svc
    .from("support_tickets").select("status").eq("id", ticketId).maybeSingle();
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === "resolved" || status === "closed") {
    patch.resolved_at = new Date().toISOString();
  }
  const { error } = await svc
    .from("support_tickets").update(patch).eq("id", ticketId);
  if (error) return { error: error.message };
  await logAdminAction({
    ctx: ctxOf(auth), action: "support.ticket_status_changed",
    target_table: "support_tickets", target_id: ticketId,
    before_value: { status: before?.status ?? null },
    after_value: { status },
  });
  revalidatePath("/admin/tickets");
  revalidatePath(`/admin/tickets/${ticketId}`);
  return {};
}

/**
 * Append an inline admin reply: stores the reply in support_tickets.admin_notes
 * as a timestamped, author-tagged entry, AND sends the body to the user via
 * the existing Bluehost SMTP mailer.
 *
 * Why admin_notes (not a separate ticket_messages table)? The current schema
 * doesn't have a thread table; admin_notes is the canonical place for
 * everything the admin has said. Each entry is prefixed with a header line
 * so the rendering layer can split them.
 *
 * Audit logged as 'support.ticket_replied' with reply length + user email.
 */
export async function sendTicketReply(
  ticketId: string,
  body: string,
): Promise<{ error?: string }> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  const trimmed = body.trim();
  if (trimmed.length < 5) return { error: "Reply too short (5+ chars required)" };

  const svc = makeSvc();
  // Need the ticket subject + user email to send the message
  const { data: ticket } = await svc
    .from("support_tickets")
    .select("id, subject, status, admin_notes, user_id")
    .eq("id", ticketId)
    .maybeSingle();
  if (!ticket) return { error: "Ticket not found" };

  // Look up user email
  const { data: { user: au }, error: auErr } = await svc.auth.admin.getUserById(ticket.user_id);
  if (auErr || !au?.email) return { error: "User email not on file — cannot send reply" };

  // Compose the append entry for admin_notes
  const ts = new Date().toISOString();
  const header = `[REPLY ${ts} by ${auth.email}]`;
  const newEntry = `${header}
${trimmed}`;
  const newNotes = ticket.admin_notes ? `${ticket.admin_notes}

${newEntry}` : newEntry;

  // Send the email first; only persist the reply if the send succeeded
  const { sendMail, getFromAddress } = await import("@/lib/mailer");
  const sendResult = await sendMail({
    to:      au.email,
    from:    getFromAddress(),
    subject: `Re: ${ticket.subject}`,
    text:    trimmed,
  });
  if (!sendResult || sendResult.error) {
    return { error: `Email send failed: ${sendResult?.error ?? "unknown"}` };
  }

  // Persist the reply + bump status to in_progress (if it was open)
  const newStatus = ticket.status === "open" ? "in_progress" : ticket.status;
  const { error } = await svc
    .from("support_tickets")
    .update({ admin_notes: newNotes, status: newStatus, updated_at: ts })
    .eq("id", ticketId);
  if (error) return { error: `Reply sent but DB update failed: ${error.message}` };

  await logAdminAction({
    ctx: ctxOf(auth), action: "support.ticket_replied",
    target_table: "support_tickets", target_id: ticketId,
    after_value: { reply_length: trimmed.length, recipient: au.email, status_after: newStatus },
  });

  revalidatePath("/admin/tickets");
  revalidatePath(`/admin/tickets/${ticketId}`);
  return {};
}

/**
 * Append an internal note — not sent to the user. Stored in admin_notes
 * with a [NOTE …] header so the rendering layer can distinguish replies
 * from internal commentary.
 */
export async function addTicketInternalNote(
  ticketId: string,
  note: string,
): Promise<{ error?: string }> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  const trimmed = note.trim();
  if (trimmed.length < 2) return { error: "Note too short" };

  const svc = makeSvc();
  const { data: ticket } = await svc
    .from("support_tickets").select("admin_notes").eq("id", ticketId).maybeSingle();
  if (!ticket) return { error: "Ticket not found" };

  const ts = new Date().toISOString();
  const header = `[NOTE ${ts} by ${auth.email}]`;
  const newEntry = `${header}
${trimmed}`;
  const newNotes = ticket.admin_notes ? `${ticket.admin_notes}

${newEntry}` : newEntry;

  const { error } = await svc
    .from("support_tickets")
    .update({ admin_notes: newNotes, updated_at: ts })
    .eq("id", ticketId);
  if (error) return { error: error.message };

  await logAdminAction({
    ctx: ctxOf(auth), action: "support.internal_note_added",
    target_table: "support_tickets", target_id: ticketId,
    after_value: { note_length: trimmed.length },
  });

  revalidatePath("/admin/tickets");
  revalidatePath(`/admin/tickets/${ticketId}`);
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
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  if (auth.id === userId) {
    return { error: "Cannot delete your own admin account" };
  }
  const svc = makeSvc();
  const { data: beforeProfile } = await svc
    .from("profiles").select("email, full_name, role")
    .eq("user_id", userId).maybeSingle();
  const { error } = await svc.auth.admin.deleteUser(userId);
  if (error) return { error: error.message };
  await logAdminAction({
    ctx: ctxOf(auth), action: "users.deleted",
    target_table: "auth.users", target_id: userId,
    before_value: beforeProfile ?? null,
  });
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

/**
 * Bulk delete users. Self-protection: silently filters out the calling admin's id.
 */
export async function deleteUsers(userIds: string[]): Promise<BulkResult> {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return { succeeded: [], failed: userIds.map((id) => ({ userId: id, error: auth.error })) };
  }
  const callerId = auth.id;
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

  await logAdminAction({
    ctx: ctxOf(auth), action: "users.bulk_deleted",
    after_value: { requested: userIds.length, succeeded: result.succeeded.length, failed: result.failed.length },
  });

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
  const auth = await requireAdmin();
  if ("error" in auth) {
    return { succeeded: [], failed: userIds.map((id) => ({ userId: id, error: auth.error })) };
  }
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
  const auth = await requireAdmin();
  if ("error" in auth) {
    return { succeeded: [], failed: userIds.map((id) => ({ userId: id, error: auth.error })) };
  }
  const callerId = auth.id;
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

  await logAdminAction({
    ctx: ctxOf(auth), action: "users.bulk_role_changed",
    target_table: "profiles",
    after_value: { role, requested: userIds.length, succeeded: result.succeeded.length, failed: result.failed.length },
  });

  revalidatePath("/admin/users");
  return result;
}
