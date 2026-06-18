"use client";

import type { CoachSessionListEntry } from "@/services/ai/coachSessionService";

interface CoachSessionListProps {
  sessions:        CoachSessionListEntry[];
  activeSessionId: string | null;
  onPick:          (id: string | null) => void;  // null = new session
  /** Optional — wire a delete handler to surface a "×" on 0-msg sessions only. */
  onDelete?:       (id: string) => void;
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  const m  = Math.round(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function CoachSessionList({ sessions, activeSessionId, onPick, onDelete }: CoachSessionListProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <h4 className="text-xs uppercase tracking-wider text-gray-400">Recent sessions</h4>
        <button
          type="button"
          onClick={() => onPick(null)}
          className="text-xs font-semibold text-brand-700 hover:text-brand-900"
          data-testid="coach-new-session"
        >
          + New
        </button>
      </div>
      <ul className="space-y-1">
        {sessions.length === 0 && (
          <li className="text-xs text-gray-400 italic px-2 py-1">No prior sessions yet.</li>
        )}
        {sessions.slice(0, 5).map(s => {
          const active = s.id === activeSessionId;
          return (
            <li key={s.id} className="group flex items-stretch gap-1">
              <button
                type="button"
                onClick={() => onPick(s.id)}
                className={`flex-1 text-left rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                  active
                    ? "bg-brand-50 text-brand-800"
                    : "hover:bg-gray-50 text-gray-700"
                }`}
              >
                <span className="block font-medium">
                  {s.summary?.slice(0, 60) || `Session — ${s.message_count} msgs`}
                </span>
                <span className="block text-[10px] text-gray-400">{formatRelative(s.last_message_at)}</span>
              </button>
              {onDelete && s.message_count === 0 && (
                <button
                  type="button"
                  onClick={() => onDelete(s.id)}
                  aria-label={`Delete empty session from ${formatRelative(s.last_message_at)}`}
                  title="Delete this empty session"
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity self-center rounded-md px-1.5 py-0.5 text-xs text-gray-400 hover:text-red-600 hover:bg-red-50"
                  data-testid="coach-session-delete"
                >
                  ×
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
