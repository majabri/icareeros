/**
 * iCareerOS — i18n Context
 *
 * Zero-dependency locale system for Next.js App Router.
 * - Persists selected locale to localStorage
 * - Provides useTranslation() hook returning typed t() function
 * - Falls back to 'en' if locale is unsupported
 */
"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { Locale, Translations } from "./types";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "./types";
import { en } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { de } from "./de";

const DICTIONARIES: Record<Locale, Translations> = { en, es, fr, de };

const LS_KEY = "icareeros_locale";

function getStoredLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const stored = localStorage.getItem(LS_KEY) as Locale | null;
  if (stored && SUPPORTED_LOCALES.includes(stored)) return stored;
  // Try to match browser language
  const browser = navigator.language.slice(0, 2) as Locale;
  if (SUPPORTED_LOCALES.includes(browser)) return browser;
  return DEFAULT_LOCALE;
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: Translations;
}

const I18nContext = createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: en,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    setLocaleState(getStoredLocale());
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem(LS_KEY, l);
  }, []);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t: DICTIONARIES[locale] }}>
      {children}
    </I18nContext.Provider>
  );
}

/** Returns typed translation object and locale utilities. */
export function useTranslation() {
  return useContext(I18nContext);
}
