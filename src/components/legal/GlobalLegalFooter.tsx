"use client";

/**
 * Global legal footer — appears at the bottom of every page in iCareerOS.
 * Mounted once at the root layout level.
 *
 * Renders a thin strip with legal links and a "Cookie preferences" trigger
 * that re-opens the consent banner's customize panel.
 */
export function GlobalLegalFooter() {
  function openCookiePreferences() {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("icareeros:open-cookie-preferences"));
    }
  }

  return (
    <footer
      role="contentinfo"
      aria-label="Site legal"
      className="border-t border-gray-200 bg-white/70 px-4 py-3 text-xs text-gray-600 backdrop-blur"
    >
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 sm:flex-row sm:justify-between">
        <span>&copy; {new Date().getFullYear()} Jabri Solutions LLC. All rights reserved.</span>
        <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <a href="/legal/privacy" className="hover:text-gray-900 hover:underline">Privacy</a>
          <a href="/legal/terms" className="hover:text-gray-900 hover:underline">Terms</a>
          <a href="/legal/cookies" className="hover:text-gray-900 hover:underline">Cookies</a>
          <a href="/legal/ai-disclosure" className="hover:text-gray-900 hover:underline">AI Disclosure</a>
          <button
            type="button"
            onClick={openCookiePreferences}
            className="hover:text-gray-900 hover:underline"
          >
            Cookie preferences
          </button>
        </nav>
      </div>
    </footer>
  );
}
