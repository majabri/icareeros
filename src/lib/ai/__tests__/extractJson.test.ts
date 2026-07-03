/**
 * fix/jobs-smart-apply-issues Fix 2 — extractJson tolerance tests.
 */
import { describe, it, expect } from "vitest";
import { extractJson } from "../extractJson";

describe("extractJson", () => {
  it("parses a naked JSON object", () => {
    expect(extractJson<{ a: number }>('{"a": 1}')).toEqual({ a: 1 });
  });
  it("strips ```json … ``` fences", () => {
    const raw = '```json\n{"subject":"S","body":"B"}\n```';
    expect(extractJson<{ subject: string; body: string }>(raw)).toEqual({ subject: "S", body: "B" });
  });
  it("strips ``` … ``` fences (no language tag)", () => {
    const raw = '```\n{"x": true}\n```';
    expect(extractJson<{ x: boolean }>(raw)).toEqual({ x: true });
  });
  it("recovers when Claude adds a preamble", () => {
    const raw = 'Here is the JSON you asked for: {"ok": 1}';
    expect(extractJson<{ ok: number }>(raw)).toEqual({ ok: 1 });
  });
  it("recovers from preamble + postamble", () => {
    const raw = 'Sure! {"v": 42} That should work.';
    expect(extractJson<{ v: number }>(raw)).toEqual({ v: 42 });
  });
  it("throws on completely unparseable input", () => {
    expect(() => extractJson("no json here at all")).toThrow();
  });
});
