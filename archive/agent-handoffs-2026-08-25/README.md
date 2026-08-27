# Archived agent handoff docs

**Archived:** 2026-08-25
**Reason:** Work topology consolidated to two surfaces — Chat (Cowork) and
Claude Code. The `AGENT_HANDOFF_YYYYMMDD.md` pattern is retired: Claude Code
re-derives state from git history plus its own memory at the start of every
session, so a hand-maintained handoff doc is debt that goes stale between the
moment it is written and the moment it is read.

These files are kept for historical context only. **They are not current.**
Anything in here that describes live system state (env vars, feature flags,
launch blockers, HEAD commits, table names) has almost certainly moved on —
check `git log`, `CLAUDE.md`, and the live Supabase/Vercel projects instead.

| File | Covers |
|---|---|
| `AGENT_HANDOFF_SPRINT3.md` | Sprint 3 |
| `AGENT_HANDOFF_20260427.md` | Repo bootstrap, azjobs extraction |
| `AGENT_HANDOFF_20260429b.md` | Day 31 follow-on — Stripe, admin toggle, DNS, landing |
| `AGENT_HANDOFF_20260430f.md` | End of April state |

Backlog and follow-up work now lives in GitHub Issues on `majabri/icareeros`.
