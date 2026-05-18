/**
 * POST /api/admin/hire-users/[id]/reset-password — send a password reset.
 *
 * Generates a recovery link via supabase.auth.admin.generateLink and sends
 * it to the employer's email via the project's Bluehost SMTP (the same
 * relay used for job alerts + admin support replies). Admin-only.
 */

import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { requirePermission, permissionErrorResponse } from "@/lib/admin/permissions.server";
import { logAdminAction } from "@/lib/admin/audit";
import { sendMail } from "@/lib/mailer";

export const dynamic    = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime    = "nodejs";

function makeSvc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

const ROOT_URL =
  process.env.NEXT_PUBLIC_ROOT_URL ?? "https://icareeros.com";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const r = await requirePermission("users.change_plan"); // any L2+ admin
  if (!r.ok) return permissionErrorResponse(r);

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing user id" }, { status: 400 });

  const svc = makeSvc();

  // Confirm target is an employer (wrong-tab safety).
  const { data: role } = await svc
    .from("user_roles")
    .select("role")
    .eq("user_id", id)
    .maybeSingle();
  if (role?.role !== "employer") {
    return NextResponse.json({ error: "Target user is not an employer" }, { status: 400 });
  }

  // Resolve email
  const { data: au, error: auErr } = await svc.auth.admin.getUserById(id);
  if (auErr || !au?.user?.email) {
    return NextResponse.json({ error: "User email not on file" }, { status: 404 });
  }
  const email = au.user.email;

  const { data: link, error: linkErr } = await svc.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${ROOT_URL}/auth/confirm` },
  });
  if (linkErr || !link?.properties?.action_link) {
    return NextResponse.json(
      { error: linkErr?.message ?? "Failed to generate reset link" },
      { status: 500 },
    );
  }
  const actionLink = link.properties.action_link;

  const html =
    `<p>Hello,</p>` +
    `<p>An iCareerOS admin has initiated a password reset on your behalf.` +
    ` Click the link below to choose a new password:</p>` +
    `<p><a href="${actionLink}">Reset your password</a></p>` +
    `<p>If you did not request this, you can ignore this email.</p>`;
  const text =
    `An iCareerOS admin initiated a password reset on your behalf.\n` +
    `Use this link to choose a new password:\n${actionLink}\n\n` +
    `If you did not request this, you can ignore this email.`;

  const sendResult = await sendMail({
    to: email,
    subject: "Reset your iCareerOS password",
    html,
    text,
  });
  if (!sendResult) {
    return NextResponse.json(
      { error: "SMTP not configured on this deployment" },
      { status: 500 },
    );
  }
  if (sendResult.rejected && sendResult.rejected.length > 0) {
    return NextResponse.json(
      { error: `Email rejected by relay (${sendResult.rejected.join(", ")})` },
      { status: 502 },
    );
  }

  await logAdminAction({
    ctx: r.ctx,
    action: "users.password_reset_sent",
    target_table: "auth.users",
    target_id: id,
    after_value: { email, tab: "hire" },
  });

  return NextResponse.json({ ok: true });
}
