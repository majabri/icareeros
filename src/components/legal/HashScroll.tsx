"use client";

import { useEffect } from "react";

/**
 * Workaround for Next.js App Router + flex-wrapped layouts where native
 * browser anchor-scroll on initial page load can land at the top instead
 * of the targeted element. Specifically affects /legal/terms#founding-offer
 * which is linked from FoundingOfferConsent on the /founding checkout.
 *
 * Re-runs the scroll-to-anchor on mount once the layout has rendered.
 * No-op if there's no hash in the URL.
 */
export function HashScroll() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash || hash.length < 2) return;
    const id = hash.slice(1);
    // requestAnimationFrame ensures layout has settled before scrolling.
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "auto", block: "start" });
    });
    return () => cancelAnimationFrame(raf);
  }, []);
  return null;
}
