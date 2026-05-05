/**
 * GET  /api/support — list current user's tickets
 * POST /api/support — submit a new support ticket
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { sendMail } from "@/lib/mailer";

async function makeSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch { /* server component */ }
        },
      },
    },
  );
}

export type TicketPriority = "low" | "normal" | "high" | "urgent";
export type TicketStatus   = "open" | "in_progress" | "resolved" | "closed";

export interface SupportTicket {
  id: string;
  subject: string;
  body: string;
  priority: TicketPriority;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
}

const ADMIN_EMAIL = process.env.SUPPORT_ADMIN_EMAIL ?? "info@icareeros.com";

// ── GET ────────────────────────────────────────────────────────────────────────

export async function GET() {
  const supabase = await makeSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data, error } = await supabase
    .from("support_tickets")
    .select("id, subject, body, priority, status, created_at, updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ tickets: (data ?? []) as SupportTicket[] });
}

// ── POST ───────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await makeSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { subject, body: ticketBody, priority } = body as {
    subject?: unknown;
    body?: unknown;
    priority?: unknown;
  };

  if (!subject || !ticketBody || typeof subject !== "string" || typeof ticketBody !== "string") {
    return NextResponse.json({ error: "subject and body are required strings" }, { status: 400 });
  }
  if (subject.length < 5 || subject.length > 200) {
    return NextResponse.json({ error: "subject must be 5–200 characters" }, { status: 400 });
  }
  if (ticketBody.length < 10 || ticketBody.length > 5000) {
    return NextResponse.json({ error: "body must be 10–5000 characters" }, { status: 400 });
  }

  const validPriorities: TicketPriority[] = ["low", "normal", "high", "urgent"];
  const resolvedPriority: TicketPriority =
    typeof priority === "string" && validPriorities.includes(priority as TicketPriority)
      ? (priority as TicketPriority)
      : "normal";

  const { data: ticket, error: insertErr } = await supabase
    .from("support_tickets")
    .insert({
      user_id: user.id,
      subject,
      body: ticketBody,
      priority: resolvedPriority,
    })
    .select("id, subject, body, priority, status, created_at, updated_at")
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  // Fire-and-forget admin notification email
  const priorityEmoji = { low: "🟢", normal: "🔵", high: "🟠", urgent: "🔴" }[resolvedPriority];
  sendMail({
    to: ADMIN_EMAIL,
    subject: `${priorityEmoji} [iCareerOS Support] ${subject}`,
    html: `
      <p><strong>From:</strong> ${user.email}</p>
      <p><strong>Priority:</strong> ${resolvedPriority}</p>
      <p><strong>Ticket ID:</strong> ${(ticket as SupportTicket).id}</p>
      <hr/>
      <p>${ticketBody.replace(/\n/g, "<br/>")}</p>
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://icareeros.vercel.app"}/admin">View in Admin</a></p>
    `,
    text: `Support ticket from ${user.email}\nPriority: ${resolvedPriority}\n\n${ticketBody}`,
  }).catch(() => { /* non-critical */ });

  return NextResponse.json({ ticket: ticket as SupportTicket }, { status: 201 });
}
