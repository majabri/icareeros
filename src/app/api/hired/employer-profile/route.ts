/**
 * GET  /api/hired/employer-profile — read the authenticated employer's
 *      company profile (or { hasProfile: false } when none yet).
 * PUT  /api/hired/employer-profile — upsert the company profile.
 *
 * Phase 3 (2026-05-17). employer role required for both verbs. The
 * RLS policies on employer_profiles already enforce user_id = auth.uid()
 * for SELECT / INSERT / UPDATE, so the role check is defence in depth.
 *
 * Body shape (PUT):
 *   { company_name: string;     // required, trimmed
 *     industry?:    string;
 *     company_size?: "1-10" | "11-50" | "51-200" | "201-1000" | "1000+";
 *     website?:     string;     // accepts naked domain or full URL }
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { withCrossSubdomainCookie } from "@/lib/supabase-cookie-options";

const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-1000", "1000+"] as const;
type CompanySize = (typeof COMPANY_SIZES)[number];

async function makeSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cs: Array<{ name: string; value: string; options: CookieOptions }>) {
          cs.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, withCrossSubdomainCookie(options)),
          );
        },
      },
    },
  );
}

async function requireEmployer(supabase: ReturnType<Awaited<ReturnType<typeof makeSupabaseServer>>["auth"]["getUser"]> extends infer T ? T : never) {
  // type plumbing helper — we just need a typed handle.
  return supabase;
}
void requireEmployer; // silence unused-symbol noise

async function assertEmployer(supabase: Awaited<ReturnType<typeof makeSupabaseServer>>) {
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const { data: roleRows, error: roleErr } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  if (roleErr) {
    return { error: NextResponse.json({ error: roleErr.message }, { status: 500 }) };
  }
  const isEmployer = (roleRows ?? []).some((r) => (r as { role?: string }).role === "employer");
  if (!isEmployer) {
    return { error: NextResponse.json({ error: "Forbidden — employer role required" }, { status: 403 }) };
  }
  return { user };
}

export async function GET() {
  try {
    const supabase = await makeSupabaseServer();
    const gate = await assertEmployer(supabase);
    if ("error" in gate) return gate.error;
    const { user } = gate;

    const { data, error } = await supabase
      .from("employer_profiles")
      .select("company_name, industry, company_size, website, created_at, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ hasProfile: false }, { status: 200 });
    }
    return NextResponse.json({ hasProfile: true, profile: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const supabase = await makeSupabaseServer();
    const gate = await assertEmployer(supabase);
    if ("error" in gate) return gate.error;
    const { user } = gate;

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const companyName = typeof body.company_name === "string" ? body.company_name.replace(/\s+/g, " ").trim() : "";
    if (!companyName) {
      return NextResponse.json({ error: "company_name is required" }, { status: 400 });
    }
    const industry    = typeof body.industry    === "string" ? body.industry.trim()    : null;
    const website     = typeof body.website     === "string" ? body.website.trim()     : null;
    const sizeRaw     = typeof body.company_size === "string" ? body.company_size.trim() : "";
    const companySize: CompanySize | null = (COMPANY_SIZES as readonly string[]).includes(sizeRaw)
      ? (sizeRaw as CompanySize)
      : null;

    const { error: upErr } = await supabase
      .from("employer_profiles")
      .upsert(
        {
          user_id:      user.id,
          company_name: companyName,
          industry,
          company_size: companySize,
          website,
        },
        { onConflict: "user_id" },
      );
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
