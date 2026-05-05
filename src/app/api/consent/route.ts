import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { CookieOptions } from "@supabase/ssr";
import { z } from "zod";
import { createHash } from "node:crypto";

const ConsentBody = z.object({
  schemaVersion: z.literal(1),
  kind: z.enum(["cookie", "tos"]).default("cookie"),
  necessary: z.literal(true),
  functional: z.boolean(),
  analytics: z.boolean(),
  marketing: z.boolean(),
  gpcDetected: z.boolean(),
  sessionId: z.string().min(1).max(100).optional(),
});

export async function POST(req: Request) {
  const SALT = process.env.CONSENT_IP_SALT;
  // If salt is missing we still accept the consent — local state is the source
  // of truth and we don't want a broken /api/consent to break the banner UX —
  // but we record without an ip_hash. Surface a console warning at boot in CI.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const parsed = ConsentBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request", details: parsed.error.flatten() }, { status: 400 });
  }

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const ip_hash = ip && SALT ? createHash("sha256").update(ip + SALT).digest("hex") : null;
  const ua = (req.headers.get("user-agent") ?? "").slice(0, 250);

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cs: Array<{ name: string; value: string; options: CookieOptions }>) {
          cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase.from("consent_records").insert({
    user_id: user?.id ?? null,
    session_id: parsed.data.sessionId ?? null,
    schema_version: parsed.data.schemaVersion,
    kind: parsed.data.kind,
    necessary: parsed.data.necessary,
    functional: parsed.data.functional,
    analytics: parsed.data.analytics,
    marketing: parsed.data.marketing,
    gpc_detected: parsed.data.gpcDetected,
    ip_hash,
    user_agent: ua,
  });

  if (error) {
    return NextResponse.json({ error: "insert_failed", message: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
