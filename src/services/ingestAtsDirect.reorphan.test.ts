/**
 * v12 re-orphan regression tests — Platform 2026-08-04 approved shape.
 *
 * The v12 first shape (SELECT-then-preserve helper) was ripped out in this
 * rework. Platform's approved fix instead:
 *
 *   1. Omit `enrichment_status` from the GH/SR/WD upsert payloads entirely.
 *      Conflict-updates only touch provided columns — omission means refresh
 *      can never clobber status.
 *   2. New rows get 'needs_description' via a BEFORE INSERT trigger:
 *      supabase/migrations/20260804163000_ats_jobs_needs_description_insert_trigger.sql
 *
 * These tests assert the payload SHAPE the ingest code produces, which is
 * the observable half of the fix. The trigger half is a DB-level assertion
 * documented in the migration file's post-apply verification section.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ─────────────────────────────────────────────────────────────────────
// Item 1 — GH/SR/WD payloads omit enrichment_status
// ─────────────────────────────────────────────────────────────────────

describe("v12 payload shape — GH/SR/WD omit enrichment_status (Platform 2026-08-04)", () => {
  const ingestSource = readFileSync(
    resolve(process.cwd(), "supabase/functions/ingest-ats-direct/index.ts"),
    "utf8",
  );

  function payloadBlockFor(source: string): string {
    // Extract the row-object literal for a given source. Matches from
    // `source: "<name>",` up to the closing `};` of the map callback.
    const marker = `source: "${source}",`;
    const start = ingestSource.indexOf(marker);
    expect(start).toBeGreaterThan(-1);
    const end = ingestSource.indexOf("};", start);
    expect(end).toBeGreaterThan(start);
    return ingestSource.slice(start, end);
  }

  it("greenhouse payload does NOT include enrichment_status (BEFORE INSERT trigger handles it)", () => {
    const block = payloadBlockFor("greenhouse");
    expect(block).not.toMatch(/enrichment_status:/);
  });

  it("smartrecruiters payload does NOT include enrichment_status", () => {
    const block = payloadBlockFor("smartrecruiters");
    expect(block).not.toMatch(/enrichment_status:/);
  });

  it("workday payload does NOT include enrichment_status", () => {
    const block = payloadBlockFor("workday");
    expect(block).not.toMatch(/enrichment_status:/);
  });

  it("ashby payload STILL includes enrichment_status: 'pending' — inline-description source (conscious decision, see PR body)", () => {
    // Ashby returns descriptions in the list endpoint. On refresh, the
    // vendor's updated description flows through and we WANT skills-
    // extraction to re-run on it — hence enrichment_status='pending'
    // gets written on every refresh, which is correct behavior for
    // inline-description sources.
    const block = payloadBlockFor("ashby");
    expect(block).toMatch(/enrichment_status: "pending"/);
  });

  it("lever payload STILL includes enrichment_status: 'pending' — same inline-description rationale", () => {
    const block = payloadBlockFor("lever");
    expect(block).toMatch(/enrichment_status: "pending"/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Item 2 — BEFORE INSERT trigger migration file exists + is BEFORE INSERT only
// ─────────────────────────────────────────────────────────────────────

describe("v12 trigger migration — BEFORE INSERT only, per Platform 2026-08-04", () => {
  const migrationPath = resolve(
    process.cwd(),
    "supabase/migrations/20260804163000_ats_jobs_needs_description_insert_trigger.sql",
  );
  const migration = readFileSync(migrationPath, "utf8");

  it("migration file present + marks NOT YET APPLIED", () => {
    expect(migration).toMatch(/NOT YET APPLIED/);
  });

  it("trigger is BEFORE INSERT (not BEFORE UPDATE) — conflict-UPDATE path stays untouched", () => {
    // Assert the CREATE TRIGGER statement itself is BEFORE INSERT.
    // The migration comment mentions "BEFORE UPDATE" only to explain
    // why we DON'T use it — so we extract the DDL and check just that.
    const createTriggerBlock = migration.match(/CREATE TRIGGER[\s\S]+?EXECUTE FUNCTION[^;]+;/);
    expect(createTriggerBlock).not.toBeNull();
    const ddl = createTriggerBlock![0];
    expect(ddl).toMatch(/BEFORE INSERT ON public\.ats_jobs/);
    expect(ddl).not.toMatch(/BEFORE UPDATE/);
    expect(ddl).not.toMatch(/BEFORE INSERT OR UPDATE/);
  });

  it("trigger guard: source IN (greenhouse, smartrecruiters, workday) + empty description + default status", () => {
    expect(migration).toMatch(/NEW\.source IN \('greenhouse', 'smartrecruiters', 'workday'\)/);
    expect(migration).toMatch(/NEW\.description IS NULL OR NEW\.description = ''/);
    expect(migration).toMatch(/NEW\.enrichment_status = 'pending'/);
  });

  it("trigger sets NEW.enrichment_status := 'needs_description' when guard matches", () => {
    expect(migration).toMatch(/NEW\.enrichment_status := 'needs_description'/);
  });

  it("trigger rationale documented in-file — why trigger-not-payload", () => {
    // Amir 2026-08-04: 'add a test or migration comment documenting why
    // trigger-not-payload (payload can't distinguish insert from
    // conflict-update under upsert)'.
    expect(migration).toMatch(/[Pp]ayload cannot distinguish/);
    expect(migration).toMatch(/BEFORE INSERT ONLY/);
  });
});
