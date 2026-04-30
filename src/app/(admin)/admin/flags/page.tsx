import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { CookieOptions } from "@supabase/ssr";
import { FeatureFlagToggle } from "@/components/admin/FeatureFlagToggle";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Feature Flags — iCareerOS Admin" };

async function makeSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cs: Array<{ name: string; value: string; options: CookieOptions }>) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
    },
  });
}

export default async function AdminFlagsPage() {
  const supabase = await makeSupabaseServer();
  const { data: flags, error } = await supabase.from("feature_flags").select("key, enabled, updated_at").order("key");
  if (error) return <div className="p-8 text-red-600 text-sm">Error: {error.message}</div>;
  const enabled = (flags ?? []).filter(f => f.enabled).length;
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Feature Flags</h1>
        <p className="mt-1 text-sm text-gray-500">{flags?.length ?? 0} flags — {enabled} enabled · {(flags?.length ?? 0) - enabled} disabled</p>
      </div>
      <FeatureFlagToggle initial={flags ?? []} />
    </div>
  );
}
