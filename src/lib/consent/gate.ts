import type { ConsentCategory } from "./storage";
import { readConsent } from "./storage";

/**
 * Is the user opted in to the given non-essential cookie category?
 * Strictly-necessary cookies don't go through this gate (they're always on).
 *
 * SSR-safe: returns false on the server. Components that need consent state
 * for rendering should check after mount or rely on a useState/useEffect.
 */
export function hasConsent(category: ConsentCategory): boolean {
  const c = readConsent();
  if (!c) return false;
  return c[category] === true;
}
