"use client";

import { useEffect } from "react";

/**
 * Workaround for Next.js App Router + scroll-behavior:smooth on <html>:
 *
 * The browser's native anchor scroll runs as an async smooth animation,
 * which gets interrupted by post-mount layout shifts (cookie consent
 * banner, font swaps, etc.) and ends up snapping the page back to the top.
 *
 * Fix:
 *  1. Wait for layout to settle (200ms timeout) so the cookie banner has
 *     mounted and shifted layout.
 *  2. Use scrollIntoView({ behavior: "instant" }) — non-spec but widely
 *     supported, overrides the smooth CSS rule for this single jump.
 *
 * No-op if the URL has no hash. Mounted in /legal/privacy and /legal/terms
 * to support the #ai-processing and #founding-offer anchors used by the
 * signup-consent and founding-checkout components respectively.
 */
export function HashScroll() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash || hash.length < 2) return;
    const id = hash.slice(1);

    const t = setTimeout(() => {
      const el = document.getElementById(id);
      if (!el) return;
      // `behavior: 'instant'` overrides scroll-behavior: smooth set on <html>.
      // Cast through unknown — the spec allows 'instant' but TS lib types lag.
      el.scrollIntoView({
        behavior: "instant" as ScrollBehavior,
        block: "start",
      });
    }, 200);

    return () => clearTimeout(t);
  }, []);

  return null;
}
