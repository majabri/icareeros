import { redirect } from "next/navigation";

/**
 * /settings on hire.icareeros.com — redirects to /settings/account.
 *
 * Middleware Phase 3 rewrites `hire.icareeros.com/settings` to the internal
 * `/hire/settings` path, which resolves to this file under the (hire) route
 * group. The redirect target is the clean URL (`/settings/account`); the
 * middleware then rewrites that to `/hire/settings/account` on the way back
 * into the route tree. Targeting `/settings/account` (not
 * `/hire/settings/account`) avoids an extra 308 hop.
 *
 * Mirrors `src/app/(app)/settings/page.tsx`.
 *
 * Sources:
 * - COWORK-BRIEF-hire-settings-v1 (2026-05-19)
 * - CP1 decisions locked 2026-05-20
 */
export default function HireSettingsIndexPage() {
  redirect("/settings/account");
}
