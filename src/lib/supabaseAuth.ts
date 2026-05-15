import type { SupabaseClient, User } from "@supabase/supabase-js";

type MaybeUser = User | null;

/**
 * Best-effort user resolution for client components.
 *
 * In some deployments, `auth.getUser()` can transiently return null (or throw)
 * during early hydration even though a session exists. `auth.getSession()` is
 * a cheaper read-path that works for gating UI and enabling "Save" flows.
 */
export async function getAuthedUser(supabase: SupabaseClient): Promise<MaybeUser> {
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) return data.session.user;
  } catch {
    // Ignore and fall back to getUser()
  }

  try {
    const { data } = await supabase.auth.getUser();
    return data.user ?? null;
  } catch {
    return null;
  }
}

export async function getAuthedUserId(
  supabase: SupabaseClient
): Promise<string | null> {
  const user = await getAuthedUser(supabase);
  return user?.id ?? null;
}

