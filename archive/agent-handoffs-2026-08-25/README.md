# Archived agent handoffs (frozen 2026-08-25)

These `AGENT_HANDOFF_*.md` files are **historical records, not live state.**
They were written under the old multi-arm Cowork topology, where each session
handed the next one a written state dump.

That topology was retired on 2026-08-25 (tracking issue #410). Work now splits
two ways:

- **Chat (Cowork)** — strategy, planning, triage. Writes GitHub Issues.
- **Claude Code (cloud, via GitHub)** — all code changes.

Claude Code re-derives repo state from git history, open issues/PRs, and its own
memory at the start of each session, so there is nothing to hand off. Do not add
new files here, and do not treat anything in this directory as current.

| File | Covers | Written |
|---|---|---|
| `AGENT_HANDOFF_20260427.md` | Week 1 — new repo setup | 2026-04-27 |
| `AGENT_HANDOFF_20260429b.md` | Day 32 — Sentry / BetterStack / k6 baseline | 2026-04-29 |
| `AGENT_HANDOFF_20260430f.md` | Days 47–66 — platform launch readiness | 2026-04-29 |
| `AGENT_HANDOFF_SPRINT3.md` | Sprint 3 W2 + Wave 4 close-out | 2026-05-13 |
