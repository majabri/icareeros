import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { withCrossSubdomainCookie } from "@/lib/supabase-cookie-options";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { CookieOptions } from "@supabase/ssr";
import AdminLayoutClient from "@/components/admin/AdminLayoutClient";
import type { AdminRole } from "@/lib/admin/permissions";

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cs: Array<{ name: string; value: string; options: CookieOptions }>) {
          cs.forEach(({ name, value, options }) => cookieStore.set(name, value, withCrossSubdomainCookie(options)));
        },
      },
    }
  );
}

function isValidAdminRole(s: string | null | undefined): s is AdminRole {
  return s === "super_admin" || s === "admin" || s === "support_l2" || s === "support_l1" || s === "viewer";
}

export default async function AdminRootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?redirect=/admin");

  // Sprint 4 W2-A: read admin_role (5-tier) + legacy role (binary, backward compat)
  // via service-role to bypass profile RLS.
  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data: profile } = await svc
    .from("profiles")
    .select("role, admin_role")
    .eq("user_id", user.id)
    .maybeSingle();

  // Resolve effective admin_role with the same rules as requirePermission():
  // explicit admin_role wins; legacy role='admin' falls back to super_admin.
  let adminRole: AdminRole | null = null;
  if (profile?.admin_role && isValidAdminRole(profile.admin_role)) {
    adminRole = profile.admin_role as AdminRole;
  } else if (profile?.role === "admin") {
    adminRole = "super_admin";
  }

  if (!adminRole) redirect("/dashboard");

  return (
    <AdminLayoutClient
      adminEmail={user.email ?? ""}
      adminRole={adminRole}
    >
      {children}
    </AdminLayoutClient>
  );
}
