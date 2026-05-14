import { createClient } from "@supabase/supabase-js";
import { FeatureFlagToggle } from "@/components/admin/FeatureFlagToggle";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import AdminEmptyState from "@/components/admin/ui/AdminEmptyState";
import AdminErrorState from "@/components/admin/ui/AdminErrorState";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Feature Flags — iCareerOS Admin" };

function makeSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export default async function AdminFlagsPage() {
  const svc = makeSvc();

  // Service-role read: page-level admin gate is in layout.tsx + middleware.ts.
  const { data: flags, error } = await svc
    .from("feature_flags")
    .select("key, enabled, description, value, updated_at, updated_by, is_production")
    .order("key");

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <AdminPageHeader title="Feature Flags" />
        <AdminErrorState message={error.message} />
      </div>
    );
  }

  // Resolve updated_by → admin email (single round-trip; admin pool is small)
  const uuids = Array.from(new Set((flags ?? []).map(f => f.updated_by).filter(Boolean) as string[]));
  const emailByUid = new Map<string, string>();
  if (uuids.length > 0) {
    const { data: { users } } = await svc.auth.admin.listUsers({ perPage: 1000 });
    for (const u of users) {
      if (u.id && u.email && uuids.includes(u.id)) emailByUid.set(u.id, u.email);
    }
  }

  const enriched = (flags ?? []).map(f => ({
    ...f,
    updated_by_email: f.updated_by ? (emailByUid.get(f.updated_by as string) ?? null) : null,
  }));

  const totalFlags  = enriched.length;
  const enabled     = enriched.filter(f => f.enabled).length;
  const production  = enriched.filter(f => f.is_production).length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <AdminPageHeader
        title="Feature Flags"
        description={
          <>
            {totalFlags} flags · {enabled} enabled · {totalFlags - enabled} disabled
            {production > 0 && <>{" "}· <span className="text-rose-700 dark:text-rose-300">{production} production-marked</span></>}
            . Toggles are immediate. Production flags require a type-to-confirm step.
          </>
        }
      />

      {totalFlags === 0 ? (
        <AdminEmptyState
          title="No feature flags found"
          description="Add rows to public.feature_flags to control gated features. Each row needs at minimum a unique key and an enabled boolean."
        />
      ) : (
        <FeatureFlagToggle initial={enriched} />
      )}

      <p className="mt-8 text-xs text-gray-400 dark:text-gray-500">
        <strong className="text-gray-500 dark:text-gray-400">Note:</strong>{" "}
        The Vercel env var <code className="rounded bg-gray-100 dark:bg-gray-800 px-1">NEXT_PUBLIC_MONETIZATION_ENABLED</code> is baked into the build —
        update it in Vercel Settings and redeploy when you&apos;re ready to go live. The DB flag
        {" "}<code className="rounded bg-gray-100 dark:bg-gray-800 px-1">monetization_enabled</code>{" "}
        is what server routes check at runtime.
      </p>
    </div>
  );
}
