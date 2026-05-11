"use client";

/**
 * CityTypeahead — debounced autocomplete for the Settings → Account
 * compliance-location city field. Wave 2 of COWORK-BRIEF-uat-continuation-v1.
 *
 * Backed by OpenStreetMap Nominatim:
 *   https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&city={q}&limit=5
 *
 * Nominatim is free, no key required, and rate-limited by their usage
 * policy to ~1 req/sec per IP. We respect that with:
 *   - min 2 chars before any request fires
 *   - 300ms debounce between requests
 *   - abortable in-flight fetch — typing fast cancels stale lookups
 *
 * On pick, we surface the full Nominatim address record so the parent
 * can also write the resolved country code / state code, not just the
 * city string. That keeps the three location columns in sync when the
 * user picks a recognized place.
 *
 * If the user types a city Nominatim doesn't know (or the API errors),
 * the value remains as-typed — the field never gates the user.
 */

import { useEffect, useRef, useState } from "react";

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  municipality?: string;
  state?: string;
  county?: string;
  country?: string;
  country_code?: string; // lowercase
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: NominatimAddress;
}

export interface CityPickResult {
  city: string;
  /** Uppercase ISO 3166-1 alpha-2 (e.g. "US"). May be null if Nominatim omits. */
  countryCode: string | null;
  /** Free-text state/region name as returned by Nominatim. NOT a code. */
  stateName: string | null;
  /** Original Nominatim display_name — handy for debugging. */
  displayName: string;
}

interface Props {
  /** Current city value (free text). */
  value: string;
  /** Called on every keystroke. */
  onChange: (next: string) => void;
  /** Called when the user picks a Nominatim result. */
  onPick?: (result: CityPickResult) => void;
  /**
   * Optional country filter — when set, Nominatim's `countrycodes` param
   * scopes results. Use the user's selected country code to dramatically
   * improve relevance ("Springfield" otherwise returns 30+ matches).
   */
  countryCode?: string | null;
  placeholder?: string;
  id?: string;
  className?: string;
}

/** Pick the most-likely city-ish field from a Nominatim address record. */
function extractCity(addr: NominatimAddress | undefined): string {
  if (!addr) return "";
  return (
    addr.city ||
    addr.town ||
    addr.village ||
    addr.municipality ||
    addr.hamlet ||
    ""
  );
}

export function CityTypeahead({
  value,
  onChange,
  onPick,
  countryCode,
  placeholder = "Start typing a city…",
  id,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced search ────────────────────────────────────────────────────────
  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      // Cancel any in-flight request before firing a new one.
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      const params = new URLSearchParams({
        format:        "json",
        addressdetails: "1",
        limit:         "5",
        city:          q,
      });
      if (countryCode) params.set("countrycodes", countryCode.toLowerCase());

      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
          signal: ac.signal,
          headers: { "Accept-Language": "en" },
        });
        if (!res.ok) throw new Error(`Nominatim ${res.status}`);
        const data = (await res.json()) as NominatimResult[];
        if (ac.signal.aborted) return;
        setResults(Array.isArray(data) ? data : []);
        setOpen(true);
        setActive(-1);
      } catch (err) {
        // Aborted requests are expected when typing fast — silently skip.
        if (!(err instanceof Error && err.name === "AbortError")) {
          // Other errors: clear the dropdown but keep the field usable.
          setResults([]);
          setOpen(false);
        }
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [value, countryCode]);

  // Close on click outside.
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function pick(r: NominatimResult) {
    const cityName = extractCity(r.address) || r.display_name.split(",")[0]?.trim() || "";
    onChange(cityName);
    onPick?.({
      city:        cityName,
      countryCode: r.address?.country_code ? r.address.country_code.toUpperCase() : null,
      stateName:   r.address?.state ?? r.address?.county ?? null,
      displayName: r.display_name,
    });
    setOpen(false);
    setResults([]);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(a => (a + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(a => (a - 1 + results.length) % results.length);
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapperRef} className={`relative ${className ?? ""}`}>
      <input
        id={id}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      {loading && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400" aria-live="polite">
          Searching…
        </span>
      )}
      {open && results.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          {results.map((r, i) => (
            <li
              key={r.place_id}
              role="option"
              aria-selected={i === active}
              onMouseDown={e => { e.preventDefault(); pick(r); }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-2 text-sm ${i === active ? "bg-brand-50 text-brand-900" : "text-gray-800 hover:bg-gray-50"}`}
            >
              <div className="font-medium">{extractCity(r.address) || r.display_name.split(",")[0]}</div>
              <div className="text-xs text-gray-500">{r.display_name}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
