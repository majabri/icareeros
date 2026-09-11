#!/usr/bin/env node
/**
 * Print a compact digest of Playwright failures at the END of the CI log.
 *
 * Why this exists: the workflow log is ~14k lines and Playwright prints each
 * failure's detail interleaved with the run, then a bare list of test titles at
 * the end. Tooling that can only read the tail of a job log therefore sees
 * *which* tests failed but never *why* — which is exactly the position we were
 * in while triaging #429/#432. This step puts "file:line — error" for every
 * failure in the last few hundred lines, where it is actually reachable.
 *
 * Reads the Playwright JSON reporter output; never fails the build itself
 * (the test step already set the exit code).
 */
import { readFileSync } from "node:fs";

const path = process.argv[2] ?? "test-results/results.json";
// 100 covers the current failure count; 40 truncated it at "and 41 more".
const MAX = Number(process.env.DIGEST_MAX ?? 100);

let report;
try {
  report = JSON.parse(readFileSync(path, "utf8"));
} catch (err) {
  console.log(`e2e-failure-digest: could not read ${path} — ${err.message}`);
  process.exit(0);
}

/** Playwright nests suites arbitrarily deep; flatten to specs. */
function* walkSpecs(suite) {
  for (const spec of suite.specs ?? []) yield spec;
  for (const child of suite.suites ?? []) yield* walkSpecs(child);
}

const failures = [];
for (const suite of report.suites ?? []) {
  for (const spec of walkSpecs(suite)) {
    if (spec.ok) continue;
    for (const test of spec.tests ?? []) {
      // Only the final attempt matters — earlier ones are retries.
      const last = test.results?.[test.results.length - 1];
      if (!last || last.status === "passed" || last.status === "skipped") continue;
      const message =
        last.error?.message ??
        last.errors?.[0]?.message ??
        `(no message; status=${last.status})`;
      failures.push({
        project: test.projectName ?? "?",
        location: `${spec.file}:${spec.line}`,
        title: spec.title,
        // Strip ANSI and collapse to the first few lines — the assertion and
        // the locator are what matter; the stack rarely is.
        message: message
          .replace(/\[[0-9;]*m/g, "")
          .split("\n")
          .slice(0, 6)
          .join("\n      ")
          .trim(),
      });
    }
  }
}

console.log("");
console.log("==================== E2E FAILURE DIGEST ====================");
console.log(`${failures.length} failing test(s). Showing up to ${MAX}.`);
console.log("");

for (const f of failures.slice(0, MAX)) {
  console.log(`[${f.project}] ${f.location}`);
  console.log(`  ${f.title}`);
  console.log(`      ${f.message}`);
  console.log("");
}

if (failures.length > MAX) {
  console.log(`... and ${failures.length - MAX} more. Raise DIGEST_MAX to see them.`);
}

// Repeat the totals at the very end, and break them down by file. The header
// counts sit hundreds of lines up once there are dozens of failures, which is
// out of reach for anything reading only the tail of the log — the exact
// problem this script exists to solve.
const byFile = new Map();
for (const f of failures) {
  const file = f.location.split(":")[0];
  byFile.set(file, (byFile.get(file) ?? 0) + 1);
}
const ranked = [...byFile.entries()].sort((a, b) => b[1] - a[1]);

console.log("");
console.log(`DIGEST SUMMARY: ${failures.length} failing test(s) across ${byFile.size} file(s)`);
for (const [file, count] of ranked) {
  console.log(`  ${String(count).padStart(3)}  ${file}`);
}
console.log("=============== END E2E FAILURE DIGEST ===============");
