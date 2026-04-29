/**
 * iCareerOS — Support Service
 * Client-side wrapper around GET/POST /api/support.
 */

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

export interface CreateTicketInput {
  subject: string;
  body: string;
  priority?: TicketPriority;
}

/** Fetch the current user's support tickets (newest first). */
export async function fetchMyTickets(): Promise<SupportTicket[]> {
  const res = await fetch("/api/support");
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Failed to fetch tickets");
  }
  const data = await res.json() as { tickets: SupportTicket[] };
  return data.tickets;
}

/** Submit a new support ticket. Returns the created ticket. */
export async function createTicket(input: CreateTicketInput): Promise<SupportTicket> {
  const res = await fetch("/api/support", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json() as { ticket?: SupportTicket; error?: string };
  if (!res.ok) throw new Error(data.error ?? "Failed to create ticket");
  return data.ticket!;
}

/** Human-readable label for ticket status. */
export function statusLabel(status: TicketStatus): string {
  const labels: Record<TicketStatus, string> = {
    open: "Open",
    in_progress: "In Progress",
    resolved: "Resolved",
    closed: "Closed",
  };
  return labels[status] ?? status;
}

/** Tailwind colour classes for status badges. */
export function statusBadgeClass(status: TicketStatus): string {
  const classes: Record<TicketStatus, string> = {
    open: "bg-blue-100 text-blue-700",
    in_progress: "bg-yellow-100 text-yellow-700",
    resolved: "bg-green-100 text-green-700",
    closed: "bg-gray-100 text-gray-600",
  };
  return classes[status] ?? "bg-gray-100 text-gray-600";
}

/** Tailwind colour classes for priority chips. */
export function priorityBadgeClass(priority: TicketPriority): string {
  const classes: Record<TicketPriority, string> = {
    low: "bg-gray-100 text-gray-600",
    normal: "bg-blue-50 text-blue-600",
    high: "bg-orange-100 text-orange-600",
    urgent: "bg-red-100 text-red-700",
  };
  return classes[priority] ?? "bg-gray-100 text-gray-600";
}
