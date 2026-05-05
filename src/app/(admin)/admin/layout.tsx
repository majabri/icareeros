import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { CookieOptions } from "@supabase/ssr";
import AdminSidebar from "@/components/admin/AdminSidebar";


async function getUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cs: Array<{ name: string; value: string; options: CookieOptions }>) {
          cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    }
  );
  return supabase.auth.getUser();
}

export default async function AdminRootLayout({ children }: { children: React.ReactNode }) {
  const { data: { user } } = await getUser();
  if (!user) redirect("/auth/login?redirect=/admin");
  // Check role from public.profiles — single source of truth
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") redirect("/dashboard");

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <header className="h-14 flex items-center justify-between border-b border-gray-200 bg-white/90 backdrop-blur-sm sticky top-0 z-40 px-4">
          <span className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
            ⚠ Admin Mode
          </span>
          <span className="text-xs text-gray-400 font-mono">{user.email}</span>
        </header>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
