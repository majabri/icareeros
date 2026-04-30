import { redirect } from "next/navigation";

/**
 * /support is now canonical at /settings/support (within the My Career layout).
 * Redirect any direct links or bookmarks.
 */
export default function SupportRedirect() {
  redirect("/settings/support");
}
