"use client";

/**
 * /profile — Career OS Evaluate Stage Entry Point
 *
 * Loads the current user's profile from `user_profiles`, renders the
 * ProfileForm for editing, and links back to the dashboard.
 *
 * Day 21: also loads the active cycle so ProfileForm can auto-trigger
 * the Evaluate AI stage after the user saves their profile.
 */

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { getActiveCycle } from "@/orchestrator/careerOsOrchestrator";
import { ProfileForm, type UserProfile } from "@/components/profile/ProfileForm";

export default function ProfilePage() {
  const [userId,  setUserId]  = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [cycleId, setCycleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();

        const { data: { user }, error: authErr } = await supabase.auth.getUser();
        if (authErr || !user) throw new Error("Not authenticated");
        setUserId(user.id);

        // Load profile and active cycle in parallel
        const [profileResult, activeCycle] = await Promise.all([
          supabase
            .from("user_profiles")
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle(),
          getActiveCycle(user.id),
        ]);

        if (profileResult.error) throw new Error(profileResult.error.message);
        if (profileResult.data) setProfile(profileResult.data as UserProfile);
        if (activeCycle) setCycleId(activeCycle.id);
      } catch (err) {
        setLoadErr(err instanceof Error ? err.message : "Failed to load profile.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">

        {/* Page header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-0.5
                             text-xs font-semibold text-blue-700 uppercase tracking-wide">
              Evaluate
            </span>
            <span className="text-sm text-gray-400">Stage 1 of 6</span>
            {cycleId && (
              <span className="text-sm text-green-600 font-medium">
                Active cycle detected
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
          <p className="mt-1 text-sm text-gray-500">
            Tell us where you are today. iCareerOS uses this to assess your market fit,
            identify skill gaps, and recommend your next career move.
            {cycleId
              ? " Saving your profile will automatically run the AI evaluation."
              : " Start a Career OS cycle on the dashboard to enable AI evaluation."}
          </p>
        </div>

        {/* Loading */}
        {loading && (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-36 animate-pulse rounded-xl bg-gray-100" />
            ))}
          </div>
        )}

        {/* Error */}
        {!loading && loadErr && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            {loadErr}
          </div>
        )}

        {/* Form */}
        {!loading && !loadErr && userId && (
          <ProfileForm initial={profile} userId={userId} cycleId={cycleId} />
        )}

        {/* Link back to dashboard */}
        <div className="mt-8 pt-4 border-t border-gray-200">
          <a
            href="/dashboard"
            className="text-sm text-blue-600 hover:underline transition-colors"
          >
            Back to Career OS Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
