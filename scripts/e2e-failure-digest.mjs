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
const MAX = Number(process.env.DIGEST_MAX ?? 40);

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
console.log("=============== END E2E FAILURE DIGEST ===============");
