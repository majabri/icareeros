"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { StagePageScaffold } from "@/components/stage/StagePageScaffold";
import { useStageData } from "@/components/stage/useStageData";
import { EvaluateOutputPanel } from "@/components/evaluate/EvaluateOutputPanel";
import { evaluateCareerProfile, type EvaluationResult } from "@/services/ai/evaluateService";

interface StoredEvaluate extends EvaluationResult {
  generatedAt?: string;
}

export function EvaluatePageInner() {
  const { loading, userId, cycle, output, reload } = useStageData<StoredEvaluate>("evaluate");
  const [running, setRunning]     = useState(false);
  const [error,   setError]       = useState<string | null>(null);
  const [profileReady, setProfileReady] = useState<boolean | null>(null);

  // Profile-completeness check — same query as the dashboard uses.
  useEffect(() => {
    if (!userId) return;
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("career_profiles")
        .select("full_name, summary, skills, work_experience, education")
        .eq("user_id", userId)
        .maybeSingle();
      if (!data) { setProfileReady(false); return; }
      const fullName = typeof data.full_name === "string" ? data.full_name.trim() : "";
      const summary  = typeof data.summary   === "string" ? data.summary.trim()   : "";
      const skills   = Array.isArray(data.skills)          ? data.skills          : [];
      const xp       = Array.isArray(data.work_experience) ? data.work_experience : [];
      const edu      = Array.isArray(data.education)       ? data.education       : [];
      setProfileReady(
        fullName.length > 0 && summary.length > 0 &&
        skills.length > 0 && xp.length > 0 && edu.length > 0,
      );
    })();
  }, [userId]);

  async function handleRun() {
    if (!userId || !cycle) return;
    setRunning(true); setError(null);
    try {
      await evaluateCareerProfile(userId, cycle.id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Evaluate failed. Try again in a moment.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <StagePageScaffold
      title="Evaluate"
      subtitle="Skills, gaps, market fit"
      stageLabel="Evaluate"
      loading={loading}
      noCycle={!loading && !cycle}
      profileIncomplete={profileReady === false}
      hasOutput={!!output}
      error={error}
      running={running}
      onRun={handleRun}
    >
      {output && <EvaluateOutputPanel result={output} generatedAt={output.generatedAt} />}
    </StagePageScaffold>
  );
}
