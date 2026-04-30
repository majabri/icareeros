"use client";

import { useState, useTransition } from "react";
import { updateTicketStatus } from "@/app/actions/adminActions";

type TicketStatus = "open" | "in_progress" | "resolved" | "closed";

const STATUS_OPTIONS: { value: TicketStatus; label: string; color: string }[] = [
  { value: "open",        label: "Open",        color: "text-blue-700 bg-blue-50 border-blue-200" },
  { value: "in_progress", label: "In Progress", color: "text-yellow-700 bg-yellow-50 border-yellow-200" },
  { value: "resolved",    label: "Resolved",    color: "text-green-700 bg-green-50 border-green-200" },
  { value: "closed",      label: "Closed",      color: "text-gray-600 bg-gray-50 border-gray-200" },
];

export function TicketStatusSelect({
  ticketId,
  currentStatus,
}: {
  ticketId: string;
  currentStatus: TicketStatus;
}) {
  const [status, setStatus] = useState<TicketStatus>(currentStatus);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const current = STATUS_OPTIONS.find(o => o.value === status)!;

  function handleChange(next: TicketStatus) {
    if (next === status) return;
    setError(null);
    startTransition(async () => {
      const result = await updateTicketStatus(ticketId, next);
      if (result.error) {
        setError(result.error);
      } else {
        setStatus(next);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="relative inline-block">
        <select
          value={status}
          onChange={e => handleChange(e.target.value as TicketStatus)}
          disabled={isPending}
          className={`appearance-none rounded-full px-3 py-1 text-xs font-semibold border cursor-pointer pr-7 transition-opacity
            ${current.color}
            ${isPending ? "opacity-50 cursor-wait" : "hover:opacity-80"}`}
        >
          {STATUS_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px]">▾</span>
      </div>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}
