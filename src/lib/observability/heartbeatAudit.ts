export interface HeartbeatAuditEvent {
  source: string;
  event_type: string;
  created_at: string | Date;
}

export interface HeartbeatAuditResult {
  stale: boolean;
  lastInvocationStart: Date | null;
  gapSeconds: number | null;
  thresholdSeconds: number;
}

export function heartbeatSourceCandidates(functionSlug: string): string[] {
  return [`edge-fn.${functionSlug}`, functionSlug];
}

export function evaluateHeartbeatStaleness(args: {
  events: HeartbeatAuditEvent[];
  functionSlug: string;
  expectedIntervalMinutes: number;
  graceMultiplier?: number;
  now?: Date;
}): HeartbeatAuditResult {
  const now = args.now ?? new Date();
  const graceMultiplier = args.graceMultiplier ?? 1.5;
  const lookbackMs = args.expectedIntervalMinutes * 60_000 * 3;
  const thresholdSeconds = Math.trunc(args.expectedIntervalMinutes * 60 * graceMultiplier);
  const cutoff = now.getTime() - lookbackMs;
  const sources = new Set(heartbeatSourceCandidates(args.functionSlug));

  const lastInvocationStart = args.events
    .filter((event) => event.event_type === "invocation.start" && sources.has(event.source))
    .map((event) => new Date(event.created_at))
    .filter((date) => !Number.isNaN(date.getTime()) && date.getTime() > cutoff)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  if (!lastInvocationStart) {
    return {
      stale: true,
      lastInvocationStart: null,
      gapSeconds: null,
      thresholdSeconds,
    };
  }

  const gapSeconds = Math.trunc((now.getTime() - lastInvocationStart.getTime()) / 1000);
  return {
    stale: gapSeconds > thresholdSeconds,
    lastInvocationStart,
    gapSeconds,
    thresholdSeconds,
  };
}
