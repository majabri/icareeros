/**
 * iCareerOS — Day 32 Load Test Baseline
 * Tool: k6 (https://k6.io)
 *
 * Usage:
 *   k6 run scripts/load-test.js
 *
 * Override the target URL:
 *   k6 run scripts/load-test.js -e BASE_URL=https://icareeros.com
 *
 * Install k6:
 *   brew install k6          (macOS)
 *   choco install k6         (Windows)
 *   sudo apt install k6      (Ubuntu)
 *
 * Baseline targets (p95):
 *   /api/health      →  < 200 ms  (edge cached)
 *   /               →  < 800 ms  (static landing page, CDN-served)
 *   /auth/login     →  < 600 ms  (static page)
 *
 * This script runs a 30-second steady-state at 10 virtual users (VUs).
 * It is intentionally conservative — this is a BASELINE, not a stress test.
 * Increase VUs and duration once the app is in production with real traffic.
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

// ─── Custom metrics ────────────────────────────────────────────────────────────

const healthP95    = new Trend("health_duration",  true);
const landingP95   = new Trend("landing_duration", true);
const loginP95     = new Trend("login_duration",   true);
const errorRate    = new Rate("error_rate");

// ─── Test configuration ────────────────────────────────────────────────────────

export const options = {
  // Baseline: ramp to 10 VUs over 10 s, hold 30 s, ramp down 10 s.
  stages: [
    { duration: "10s", target: 10 },
    { duration: "30s", target: 10 },
    { duration: "10s", target: 0  },
  ],

  thresholds: {
    // Overall: < 1% errors across all requests.
    error_rate:        ["rate<0.01"],

    // Per-endpoint p95 latency targets.
    health_duration:   ["p(95)<200"],
    landing_duration:  ["p(95)<800"],
    login_duration:    ["p(95)<600"],

    // HTTP failure rate (non-2xx/3xx) must be < 1%.
    http_req_failed:   ["rate<0.01"],
  },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || "https://icareeros.vercel.app";

function get(path) {
  return http.get(`${BASE_URL}${path}`, {
    headers: { Accept: "text/html,application/json" },
    redirects: 5,
  });
}

// ─── Main scenario ─────────────────────────────────────────────────────────────

export default function () {
  // 1. Health check (edge-cached — fastest, highest frequency in production)
  const healthRes = get("/api/health");
  healthP95.add(healthRes.timings.duration);
  const healthOk = check(healthRes, {
    "health: status 200":          (r) => r.status === 200,
    "health: body has status ok":  (r) => {
      try { return JSON.parse(r.body).status === "ok"; }
      catch { return false; }
    },
    "health: p95 < 200ms":         (r) => r.timings.duration < 200,
  });
  errorRate.add(!healthOk);

  sleep(0.5);

  // 2. Landing page (CDN-served static HTML)
  const landingRes = get("/");
  landingP95.add(landingRes.timings.duration);
  const landingOk = check(landingRes, {
    "landing: status 200":         (r) => r.status === 200,
    "landing: has iCareerOS":      (r) => r.body.includes("iCareerOS"),
    "landing: p95 < 800ms":        (r) => r.timings.duration < 800,
  });
  errorRate.add(!landingOk);

  sleep(0.5);

  // 3. Login page
  const loginRes = get("/auth/login");
  loginP95.add(loginRes.timings.duration);
  const loginOk = check(loginRes, {
    "login: status 200":           (r) => r.status === 200,
    "login: p95 < 600ms":          (r) => r.timings.duration < 600,
  });
  errorRate.add(!loginOk);

  // Idle between iterations (realistic user pacing)
  sleep(1);
}

// ─── Summary ───────────────────────────────────────────────────────────────────

export function handleSummary(data) {
  // Print a machine-readable JSON summary for CI baseline recording.
  return {
    "scripts/load-test-results.json": JSON.stringify(data, null, 2),
    stdout: textSummary(data),
  };
}

function textSummary(data) {
  const m = data.metrics;
  const lines = [
    "",
    "═══════════════════════════════════════════════════════",
    "  iCareerOS — Day 32 Load Test Baseline",
    "═══════════════════════════════════════════════════════",
    `  Target:         ${BASE_URL}`,
    `  VUs:            10 (steady state)`,
    `  Duration:       50 s total (10 ramp + 30 hold + 10 ramp-down)`,
    "",
    "  Endpoint p95 latencies",
    `  /api/health     ${p95(m.health_duration)} ms  (target < 200 ms)`,
    `  /               ${p95(m.landing_duration)} ms  (target < 800 ms)`,
    `  /auth/login     ${p95(m.login_duration)}  ms  (target < 600 ms)`,
    "",
    `  Error rate:     ${pct(m.error_rate)} %  (target < 1 %)`,
    `  HTTP failures:  ${pct(m.http_req_failed)} %`,
    "",
    `  Total requests: ${val(m.http_reqs)}`,
    `  Req/s:          ${rps(m.http_reqs, data.state?.testRunDurationMs)}`,
    "═══════════════════════════════════════════════════════",
    "",
  ];
  return lines.join("\n");
}

function p95(metric) {
  return metric ? Math.round(metric.values["p(95)"] ?? 0) : "N/A";
}
function pct(metric) {
  return metric ? (metric.values.rate * 100).toFixed(2) : "0.00";
}
function val(metric) {
  return metric ? metric.values.count : 0;
}
function rps(metric, durationMs) {
  if (!metric || !durationMs) return "N/A";
  return ((metric.values.count / durationMs) * 1000).toFixed(1);
}
