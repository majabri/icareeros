"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { CoachChatWindow }    from "@/components/coach/CoachChatWindow";
import { CoachContextPanel }  from "@/components/coach/CoachContextPanel";
import { getActiveCycle }     from "@/orchestrator/careerOsOrchestrator";
import { getSubscription }    from "@/services/billing/subscriptionService";
import { listCoachSessions }  from "@/services/ai/coachSessionService";
import { PLAN_LIMITS, type SubscriptionPlan } from "@/services/billing/types";

interface CycleInfo {
  id:            string;
  cycle_number:  number;
  goal:          string | null;
  current_stage: string;
}

export function CoachPageInner() {
  const [loading, setLoading]   = useState(true);
  const [userId,  setUserId]    = useState<string | null>(null);
  const [plan,    setPlan]      = useState<SubscriptionPlan>("free");
  const [cycle,   setCycle]     = useState<CycleInfo | null>(null);
  const [cachedBrief, setBrief] = useState<string | null>(null);
  const [sessionsUsed, setUsed] = useState(0);

  useEffect(() => {
    void (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const uid = user?.id ?? null;
      setUserId(uid);
      if (!uid) { setLoading(false); return; }

      const [activeCycle, sub, sessions] = await Promise.all([
        getActiveCycle(uid),
        getSubscription(),
        listCoachSessions(),
      ]);

      const resolvedPlan: SubscriptionPlan = sub?.plan ?? "free";
      setPlan(resolvedPlan);
      if (activeCycle) {
        setCycle(activeCycle as unknown as CycleInfo);

        // Pull the cached coach brief, if any, from career_os_stages.notes.coach.brief
        const { data: coachRow } = await supabase
          .from("career_os_stages")
          .select("notes")
          .eq("user_id", uid)
          .eq("cycle_id", (activeCycle as unknown as CycleInfo).id)
          .eq("stage", "coach")
          .maybeSingle();
        const brief = (coachRow?.notes as { brief?: { content?: string } })?.brief?.content ?? null;
        setBrief(brief);
      }

      // Sessions in last 30 days
      const thirtyDaysAgo = Date.now() - 30 * 86_400_000;
      const recentCount = sessions.filter(s => Date.parse(s.created_at) > thirtyDaysAgo).length;
      setUsed(recentCount);

      setLoading(false);
    })().catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
        <div className="h-[60vh] animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }

  // Free tier: render upgrade gate, never the chat
  if (plan === "free") {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center" data-testid="coach-upgrade-gate">
        <div className="text-3xl">🎯</div>
        <h3 className="mt-3 text-lg font-semibold text-gray-900">Interactive coaching is on Starter</h3>
        <p className="mt-2 text-sm text-gray-500 max-w-md mx-auto">
          Your current plan includes the on-demand coaching brief on the dashboard. To chat with your career coach in real time, upgrade.
        </p>
        <Link
          href="/settings/billing"
          className="mt-6 inline-flex items-center rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Upgrade to Starter — $19/mo
        </Link>
      </div>
    );
  }

  if (!cycle) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
        Start a Career OS cycle on the dashboard before chatting with your coach.
        <div className="mt-3"><Link href="/dashboard" className="text-brand-700 underline">Go to dashboard</Link></div>
      </div>
    );
  }

  const limit = PLAN_LIMITS[plan].coachSessionsPerMonth;

  return (
    <div className="grid gap-6 md:grid-cols-[280px_1fr]">
      <div className="space-y-4">
        <CoachContextPanel
          cycleNumber={cycle.cycle_number}
          goal={cycle.goal}
          currentStage={cycle.current_stage}
          cachedBrief={cachedBrief}
          sessionsUsed={sessionsUsed}
          sessionsLimit={limit}
        />
      </div>
      <CoachChatWindow cycleId={cycle.id} />
    </div>
  );
}
