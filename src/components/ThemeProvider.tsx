"use client";

/**
 * ThemeProvider — Wave 3 of COWORK-BRIEF-uat-continuation-v1.
 *
 * Holds the user's theme preference ("light" | "dark" | "auto") and exposes
 * it via context. Reads the source of truth from `user_profiles.theme_preference`
 * on mount, falls back to the localStorage mirror, falls back to "auto".
 *
 * Persistence
 * ============
 * - localStorage write: immediate (so a hard reload picks up the new preference).
 * - DB write: debounced 1s so dragging the toggle doesn't spam writes.
 *
 * Auto-mode reactivity
 * =====================
 * When preference === "auto", a media-query listener flips the resolved theme
 * live as the OS preference changes (macOS sunset/sunrise, manual dark-mode
 * toggle). The listener is set up once and a different effect handles
 * tear-down when the preference moves away from "auto".
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { createClient } from "@/lib/supabase";
import {
  applyTheme,
  isThemePreference,
  readThemeFromStorage,
  resolveTheme,
  writeThemeToStorage,
  type ThemePreference,
  type ResolvedTheme,
} from "@/lib/theme";

interface ThemeContextValue {
  /** What the user picked ("light" | "dark" | "auto"). */
  preference: ThemePreference;
  /** What's actually being rendered right now ("light" | "dark"). */
  resolved: ResolvedTheme;
  /** Change the preference. Persists to localStorage + DB. */
  setPreference: (next: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Initial render: trust whatever the no-FOUC head script already applied.
  // We seed `preference` from localStorage (synchronous) so the toggle UI
  // shows the right state from the first paint. The DB read happens on mount
  // and reconciles.
  const initialPref: ThemePreference =
    typeof window !== "undefined"
      ? (readThemeFromStorage() ?? "auto")
      : "auto";

  const [preference, setPreferenceState] = useState<ThemePreference>(initialPref);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(initialPref));

  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const dbWriteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userIdRef = useRef<string | null>(null);

  // ── Reconcile from DB on mount ───────────────────────────────────────────
  // The DB is the source of truth for cross-device sync. If localStorage and
  // DB disagree, DB wins — but we wait until after first paint to avoid
  // jank. Anonymous (signed-out) users see whatever localStorage has.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        supabaseRef.current = supabase;
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        userIdRef.current = user.id;
        const { data } = await supabase
          .from("user_profiles")
          .select("theme_preference")
          .eq("user_id", user.id)
          .maybeSingle();
        const dbPref = isThemePreference(data?.theme_preference)
          ? (data!.theme_preference as ThemePreference)
          : null;
        if (cancelled || !dbPref) return;
        // Only apply if it differs from what we already have, to avoid a
        // pointless re-render on every page load.
        if (dbPref !== preference) {
          setPreferenceState(dbPref);
          writeThemeToStorage(dbPref);
          const next = resolveTheme(dbPref);
          setResolved(next);
          applyTheme(next);
        }
      } catch {
        /* Anonymous or RLS — ignore; localStorage is the fallback. */
      }
    })();
    return () => { cancelled = true; };
    // We intentionally don't depend on `preference` — this is a once-on-mount
    // reconcile. eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-mode: live OS-preference listener ───────────────────────────────
  useEffect(() => {
    if (preference !== "auto") return;
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const next: ResolvedTheme = mq.matches ? "dark" : "light";
      setResolved(next);
      applyTheme(next);
    };
    // addEventListener with options is standard now; older Safari needs the
    // legacy addListener fallback for ~5% of users.
    if ("addEventListener" in mq) mq.addEventListener("change", onChange);
    else (mq as MediaQueryList & { addListener: (cb: () => void) => void }).addListener(onChange);
    // Sync once on mount in case the OS state shifted since last paint.
    onChange();
    return () => {
      if ("removeEventListener" in mq) mq.removeEventListener("change", onChange);
      else (mq as MediaQueryList & { removeListener: (cb: () => void) => void }).removeListener(onChange);
    };
  }, [preference]);

  // ── setPreference: write + persist + apply ───────────────────────────────
  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    writeThemeToStorage(next);
    const concrete = resolveTheme(next);
    setResolved(concrete);
    applyTheme(concrete);

    // Debounced DB write. Skip if not signed in — we don't want to flash
    // the toggle to write nothing.
    if (dbWriteTimer.current) clearTimeout(dbWriteTimer.current);
    dbWriteTimer.current = setTimeout(() => {
      const supabase = supabaseRef.current;
      const uid = userIdRef.current;
      if (!supabase || !uid) return;
      supabase
        .from("user_profiles")
        .upsert(
          { user_id: uid, theme_preference: next, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        )
        .then(({ error }) => {
          if (error) {
            // Silent — localStorage already has it; cross-device sync just
            // won't kick in for this change. Worth logging at most.
            console.warn("[theme] DB write failed:", error.message);
          }
        });
    }, 1000);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
