# iCareerOS — Observability Setup (Day 32)

This document covers the full observability stack added in Day 32:
Sentry (error tracking), BetterStack (uptime monitoring), and k6 (load testing baseline).

---

## 1. Sentry — Error Tracking

### Create a Sentry project

1. Go to [sentry.io](https://sentry.io) → New Project → **Next.js**
2. Name the project `icareeros`
3. Copy the **DSN** from the project settings (Client Keys)

### Add environment variables to Vercel

In the Vercel dashboard for the `icareeros` project → Settings → Environment Variables:

| Variable | Value | Environments |
|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | `https://xxx@oXXX.ingest.sentry.io/XXXXX` | Production, Preview |
| `SENTRY_DSN` | same DSN | Production, Preview |
| `SENTRY_AUTH_TOKEN` | token from Sentry Auth Tokens page | Production, Preview |
| `SENTRY_ORG` | `jabri-solutions` | Production, Preview |
| `SENTRY_PROJECT` | `icareeros` | Production, Preview |
| `NEXT_PUBLIC_APP_ENV` | `production` (prod) / `staging` (preview) | Per environment |

### What's instrumented

| File | Purpose |
|---|---|
| `sentry.client.config.ts` | Browser error + performance + session replay |
| `sentry.server.config.ts` | Node.js API routes, Server Components |
| `sentry.edge.config.ts` | Edge runtime routes (e.g. `/api/health`) |
| `src/app/global-error.tsx` | Catch-all error boundary, reports to Sentry |
| `next.config.js` | `withSentryConfig()` wrapper, source map upload |

### Source maps

Source maps are uploaded to Sentry on every Vercel build (requires `SENTRY_AUTH_TOKEN`).
Stack traces in the Sentry dashboard will show original TypeScript, not minified JS.

### Verify it works

After deploying:
1. Visit `/monitoring` — this is the Sentry tunnel route (bypasses ad-blockers)
2. Throw a test error from the browser console: `fetch('/api/sentry-example-api')`
3. Check the Sentry Issues dashboard — it should appear within 30 seconds

---

## 2. BetterStack — Uptime Monitoring

### Endpoint to monitor

```
GET https://icareeros.com/api/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "icareeros",
  "timestamp": "2026-04-29T12:00:00.000Z",
  "version": "dev"
}
```

### Configure the monitor in BetterStack

1. Go to [betterstack.com](https://betterstack.com) → Uptime → Monitors → **New Monitor**
2. Settings:

| Field | Value |
|---|---|
| URL | `https://icareeros.com/api/health` |
| Monitor type | HTTP / HTTPS |
| Check frequency | Every **30 seconds** |
| Regions | US East, US West, EU West (at least 2) |
| Expected status | `200` |
| Body assertion | `status` contains `ok` |
| Request timeout | `10 s` |
| Confirmation count | `2` (wait for 2 consecutive failures before alerting) |

3. **Alert** → connect to email `majabri714@gmail.com` + Slack channel if available

### Heartbeat (optional)

If you want a **cron heartbeat** (prove scheduled jobs ran), create a Heartbeat monitor
in BetterStack and ping it from your Supabase `pg_cron` jobs:

```sql
-- Example: ping BetterStack heartbeat URL after each cron job
SELECT net.http_get('https://uptime.betterstack.com/api/v1/heartbeat/<YOUR_ID>');
```

---

## 3. k6 — Load Test Baseline

### Install k6

```bash
brew install k6        # macOS
choco install k6       # Windows
sudo apt install k6    # Ubuntu/Debian
```

### Run the baseline

```bash
# Against staging (Vercel preview)
k6 run scripts/load-test.js

# Against production
k6 run scripts/load-test.js -e BASE_URL=https://icareeros.com
```

### Baseline targets (p95)

| Endpoint | Target p95 | Notes |
|---|---|---|
| `GET /api/health` | < 200 ms | Edge-cached, should be fast globally |
| `GET /` | < 800 ms | Static landing page, CDN-served |
| `GET /auth/login` | < 600 ms | Static auth page |

### Thresholds enforced

- Error rate < 1% across all requests
- HTTP failure rate (non-2xx) < 1%
- All per-endpoint p95 targets above

### CI integration (future)

To run load tests in CI, add a GitHub Actions step after deployment:

```yaml
- name: Load test baseline
  run: k6 run scripts/load-test.js -e BASE_URL=${{ env.VERCEL_URL }}
  if: github.ref == 'refs/heads/main'
```

Results are written to `scripts/load-test-results.json` (gitignored locally).

---

## 4. Alerts Summary

| Alert | Tool | Condition | Recipients |
|---|---|---|---|
| Uncaught exception | Sentry | First occurrence | Email + Slack |
| Performance regression | Sentry | p75 > 2× baseline | Email |
| Uptime failure | BetterStack | 2 consecutive failures | Email + PagerDuty |
| Load test threshold miss | k6 (CI) | Any threshold fails | PR check fails |
