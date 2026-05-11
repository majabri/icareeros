"use client";

/**
 * ThemeToggle — Wave 3 of COWORK-BRIEF-uat-continuation-v1.
 *
 * Three-state segmented control: ☀️ Light  🌙 Dark  💻 Auto.
 * Sits in AppNav near sign-out. Compact and keyboard-friendly.
 */

import { useTheme } from "./ThemeProvider";
import type { ThemePreference } from "@/lib/theme";

const MODES: Array<{ key: ThemePreference; label: string; icon: string; aria: string }> = [
  { key: "light", label: "Light", icon: "☀",  aria: "Use light theme" },
  { key: "dark",  label: "Dark",  icon: "🌙", aria: "Use dark theme" },
  { key: "auto",  label: "Auto",  icon: "💻", aria: "Follow system theme" },
];

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { preference, setPreference } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Theme preference"
      className="inline-flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white p-0.5 text-xs
                 dark:border-[hsl(220,65%,18%)] dark:bg-[hsl(220,65%,12%)]"
    >
      {MODES.map((m) => {
        const active = preference === m.key;
        return (
          <button
            key={m.key}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={m.aria}
            title={m.aria}
            onClick={() => setPreference(m.key)}
            className={
              "flex items-center gap-1 rounded-md px-2 py-1 font-medium transition-colors " +
              (active
                ? "bg-brand-600 text-white"
                : "text-gray-600 hover:bg-gray-100 dark:text-[hsl(220,50%,75%)] dark:hover:bg-[hsl(220,65%,18%)]")
            }
          >
            <span aria-hidden="true">{m.icon}</span>
            {!compact && <span>{m.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
