/**
 * PATCH /api/admin/hire-users/[id]/plan — update an employer's plan.
 *
 * Body: { plan: "free" | "starter" | "growth" | "enterprise" }
 *
 * Admin-only — gated by requirePermission("users.change_plan") (support_l2 and up).
 */

import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { requirePermission, permissionErrorResponse } from "@/lib/admin/permissions.server";
import { logAdminAction } from "@/lib/admin/audit";

export const dynamic    = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime    = "nodejs";

const HIRE_PLANS = ["free", "starter", "growth", "enterprise"] as const;
export type HirePlan = (typeof HIRE_PLANS)[number];

function makeSvc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const r = await requirePermission("users.change_plan");
  if (!r.ok) return permissionErrorResponse(r);

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing user id" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { plan?: string };
  if (!body.plan || !HIRE_PLANS.includes(body.plan as HirePlan)) {
    return NextResponse.json(
      { error: `Body must be { plan: ${HIRE_PLANS.map(p => `"${p}"`).join(" | ")} }` },
      { status: 400 },
    );
  }
  const plan = body.plan as HirePlan;

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

  // Existing row?
  const { data: before } = await svc
    .from("user_subscriptions")
    .select("plan, status")
    .eq("user_id", id)
    .maybeSingle();

  // Upsert via update-or-insert (user_subscriptions has UNIQUE(user_id)).
  const now = new Date().toISOString();
  let writeErr: { message: string } | null = null;
  if (before) {
    const { error } = await svc
      .from("user_subscriptions")
      .update({ plan, status: "active", updated_at: now })
      .eq("user_id", id);
    writeErr = error;
  } else {
    const { error } = await svc
      .from("user_subscriptions")
      .insert({ user_id: id, plan, status: "active", created_at: now, updated_at: now });
    writeErr = error;
  }
  if (writeErr) return NextResponse.json({ error: writeErr.message }, { status: 500 });

  await logAdminAction({
    ctx: r.ctx,
    action: "users.plan_changed",
    target_table: "user_subscriptions",
    target_id: id,
    before_value: before ?? null,
    after_value: { plan, status: "active", tab: "hire" },
  });

  return NextResponse.json({ ok: true, plan });
}
