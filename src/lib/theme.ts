/**
 * Theme helpers — Wave 3 of COWORK-BRIEF-uat-continuation-v1.
 *
 * Theme model
 * ============
 * Three user-facing modes:
 *   • "light"  — force light theme regardless of OS preference
 *   • "dark"   — force dark theme regardless of OS preference
 *   • "auto"   — follow window.matchMedia('(prefers-color-scheme: dark)')
 *                and live-update when the OS switches at sunset / sunrise
 *
 * The DOM is always in one of two RESOLVED states ("light" | "dark"), set as
 * `<html data-theme="dark|light">`. Logo.tsx already keys off this attribute
 * (since PR #139), and globals.css scopes its dark-mode overrides under
 * `[data-theme='dark']`. The "auto" preference is purely a stored value — at
 * paint time it resolves to one of the two concrete themes.
 *
 * Storage
 * ========
 * Source of truth: `user_profiles.theme_preference` ('light' | 'dark' | 'auto').
 * Cache: localStorage key `icareeros-theme` mirrors the same value for
 * instant initial paint with no FOUC. Cross-device sync flows through the
 * DB on next page load; intra-device toggles persist locally instantly and
 * to the DB on a 1s debounce (handled by ThemeProvider, not here).
 */

export type ThemePreference = "light" | "dark" | "auto";
export type ResolvedTheme   = "light" | "dark";

export const THEME_LS_KEY = "icareeros-theme";

const VALID: ReadonlySet<ThemePreference> = new Set(["light", "dark", "auto"]);

export function isThemePreference(v: unknown): v is ThemePreference {
  return typeof v === "string" && VALID.has(v as ThemePreference);
}

/**
 * Resolve a preference into the concrete theme to render. For "auto" we
 * read the current prefers-color-scheme media query. SSR-safe — returns
 * "light" when window is unavailable (server render).
 */
export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  if (pref === "light" || pref === "dark") return pref;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Set the `<html data-theme>` attribute to the resolved theme.
 * Side-effect free in SSR contexts.
 */
export function applyTheme(theme: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

/** Read the cached preference from localStorage (browser only). */
export function readThemeFromStorage(): ThemePreference | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(THEME_LS_KEY);
    return isThemePreference(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** Write the preference to localStorage (browser only, quota-tolerant). */
export function writeThemeToStorage(pref: ThemePreference): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_LS_KEY, pref);
  } catch {
    /* private-mode / quota — silently skip */
  }
}

/**
 * The inline-script body that runs in <head> BEFORE the React tree paints.
 * Its job: read the cached preference (or fall back to OS) and stamp the
 * resolved theme onto <html> before any pixel is rendered. This eliminates
 * the dark-flash-to-light (or vice versa) when the user has explicitly
 * chosen one theme.
 *
 * Kept as a string literal so it can be dangerouslySetInnerHTML'd into a
 * <script> tag from a Server Component. Must be self-contained — no
 * imports — and must be paranoid about old browsers / private mode.
 */
export const NO_FOUC_SCRIPT = `(function(){try{
  var k='icareeros-theme';
  var pref=null;
  try{pref=localStorage.getItem(k);}catch(e){}
  if(pref!=='light'&&pref!=='dark'&&pref!=='auto')pref='auto';
  var resolved;
  if(pref==='light'||pref==='dark'){resolved=pref;}
  else{
    try{resolved=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}
    catch(e){resolved='light';}
  }
  document.documentElement.setAttribute('data-theme',resolved);
}catch(e){}})();`;
