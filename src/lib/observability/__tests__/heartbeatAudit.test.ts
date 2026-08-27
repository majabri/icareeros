import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  evaluateHeartbeatStaleness,
  heartbeatSourceCandidates,
} from "../heartbeatAudit";

describe("evaluateHeartbeatStaleness", () => {
  it("treats a recent edge-fn.<slug> invocation.start as not stale", () => {
    const result = evaluateHeartbeatStaleness({
      events: [{
        source: "edge-fn.foo",
        event_type: "invocation.start",
        created_at: "2026-08-27T14:48:55Z",
      }],
      functionSlug: "foo",
      expectedIntervalMinutes: 1440,
      now: new Date("2026-08-27T21:00:00Z"),
    });

    expect(result.stale).toBe(false);
    expect(result.lastInvocationStart?.toISOString()).toBe("2026-08-27T14:48:55.000Z");
  });

  it("also accepts the legacy bare source slug", () => {
    const result = evaluateHeartbeatStaleness({
      events: [{
        source: "foo",
        event_type: "invocation.start",
        created_at: "2026-08-27T14:48:55Z",
      }],
      functionSlug: "foo",
      expectedIntervalMinutes: 1440,
      now: new Date("2026-08-27T21:00:00Z"),
    });

    expect(result.stale).toBe(false);
  });
});

describe("heartbeat audit migration alignment", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260827213000_heartbeat_audit_source_lookup_fix.sql"),
    "utf8",
  );

  it("looks up invocation.start rows using both canonical and bare source names", () => {
    expect(heartbeatSourceCandidates("foo")).toEqual(["edge-fn.foo", "foo"]);
    expect(migration).toMatch(/source\s*=\s*ANY\s*\(ARRAY\['edge-fn\.' \|\| fn_slug,\s*fn_slug\]\)/);
  });

  it("resolves recent null-last_invocation_start false positives during backfill", () => {
    expect(migration).toMatch(/event_type\s*=\s*'stale_edge_invocation'/);
    expect(migration).toMatch(/COALESCE\(ie\.payload->>'last_invocation_start', ''\) = ''/);
    expect(migration).toMatch(/resolved_at\s*=\s*NOW\(\)/);
  });
});
