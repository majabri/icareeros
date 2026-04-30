# iCareerOS — AI Agent Architecture
**Version:** 1.0  
**Status:** Design  
**Last updated:** 2026-04-30  
**Authors:** AI Architect / DevOps session

---

## 1. Purpose

This document maps the current iCareerOS data layer to a multi-agent AI system built around the Career OS cycle:

```
Evaluate → Advise → Learn → Act → Coach → Achieve → (next cycle)
```

Each stage is owned by a dedicated AI agent with bounded responsibilities, defined inputs, tools, and outputs. The `career_os_cycles` table acts as the state machine that orchestrates transitions between agents.

---

## 2. BDAT Domain Analysis (TOGAF)

| Domain | Current State | Agent-Ready State |
|---|---|---|
| **Business** | Career profile + vault upload | Full cycle automation: evaluate skills → land role |
| **Data** | user_profiles, resume_versions, career_os_cycles | + embeddings, agent_context bundle API |
| **Application** | Next.js + Supabase Edge Functions (60) | Edge Functions become agent tools; orchestrator added |
| **Technology** | Claude Sonnet/Haiku, Vercel, Supabase | Add pgvector embeddings, Langfuse observability |

---

## 3. Shared User Context Bundle

Every agent calls this first. One endpoint assembles the full picture:

```
GET /api/agent/context   (or supabase.functions.invoke('agent-context'))

Response:
{
  profile: {
    full_name, phone, linkedin_url, summary,
    current_position, experience_level,
    target_roles[], skills[], location, open_to_remote
  },
  resume: {
    version_name, rawText,
    parsedData: {
      contact: { name, email, phone, location },
      summary, experience[], education[],
      skills[], certifications[]
    }
  },
  currentCycle: {
    id, goal, current_stage, cycle_number, status, started_at
  },
  goals: CareerGoal[],
  recentEvents: CareerOSEvent[]   // last 10 from career_os_event_log
}
```

**This bundle is the LLM's long-term memory for all agents.** It is injected into every agent system prompt. Agents never query tables directly — they receive context from here and write results through dedicated tool calls.

---

## 4. Agent Definitions

### Agent 1 — Evaluate
**Trigger:** cycle starts, user uploads resume, or user requests re-evaluation  
**Stage value:** `career_os_cycles.current_stage = 'evaluate'`

| | Detail |
|---|---|
| **Reads** | user_profiles, resume_versions.parsed_data, career_goals |
| **Tools** | `skill-gap-analyzer` (compare skills vs target_roles + market), `market-fit-scorer` |
| **Writes** | `career_os_stages` (evaluation result JSON), `career_os_event_log` |
| **Output** | `{ skill_gaps[], strengths[], market_fit_score, gap_severity }` |
| **→ Next** | `advise` (always) |

**System prompt seed:**
```
You are the Evaluate Agent for {user.full_name}. 
Current position: {user.current_position}. Target roles: {user.target_roles}.
Skills on file: {user.skills}.
Resume experience: {resume.parsedData.experience[0..2]}.
Your job: identify skill gaps, assess market fit, output structured evaluation.
```

---

### Agent 2 — Advise
**Trigger:** Evaluate completes  
**Stage:** `advise`

| | Detail |
|---|---|
| **Reads** | Evaluate output, `opportunities` (matched jobs), `user_salary_snapshots` |
| **Tools** | `search-jobs`, `career-path-analysis` (existing edge fn), `salary-projection` (existing) |
| **Writes** | `career_goals` (updated), `career_os_stages`, `career_os_event_log` |
| **Output** | `{ recommended_roles[], action_plan, learning_priorities[], timeline_weeks }` |
| **→ Next** | `learn` if gaps are high-severity; `act` if ready-to-apply |

---

### Agent 3 — Learn
**Trigger:** Advise identifies learning priorities  
**Stage:** `learn`

| | Detail |
|---|---|
| **Reads** | Advise output, `learning_events` (history), skill_synonyms |
| **Tools** | `learning-insights` (existing edge fn), external course/cert search |
| **Writes** | `learning_events` (new recommendations + tracking), `career_os_event_log` |
| **Output** | `{ learning_plan[], resources[], estimated_weeks }` |
| **→ Next** | `act` (when learning plan accepted or time-gated) |

---

### Agent 4 — Act
**Trigger:** User is ready to apply  
**Stage:** `act`

| | Detail |
|---|---|
| **Reads** | user_profiles, latest resume_versions.rawText, opportunities, advise recommendations |
| **Tools** | `generate-cover-letter`, `generate-outreach`, `rewrite-resume`, `run-job-agent` |
| **Writes** | `applications`, `outreach_contacts`, `notifications`, `career_os_event_log` |
| **Output** | `{ applications_sent[], outreach_sent[], next_actions[] }` |
| **→ Next** | `coach` (when first interview scheduled) |

**Key design note:** Act is the only agent that triggers real-world side effects (sends emails, submits applications). All Act actions require explicit user confirmation before execution.

---

### Agent 5 — Coach
**Trigger:** Interview scheduled or application response received  
**Stage:** `coach`

| | Detail |
|---|---|
| **Reads** | `applications`, `interview_sessions`, `analysis_history`, fit check results |
| **Tools** | `mock-interview`, `generate-interview-prep`, `fit-check`, `negotiation-strategy` |
| **Writes** | `interview_sessions` (coaching notes), `analysis_history`, `career_os_event_log` |
| **Output** | `{ coaching_feedback[], interview_readiness_score, resume_improvements[] }` |
| **→ Next** | `achieve` (offer received) or `act` (iterate on more applications) |

---

### Agent 6 — Achieve
**Trigger:** Offer received or milestone hit  
**Stage:** `achieve`

| | Detail |
|---|---|
| **Reads** | `job_offers`, `milestones`, `career_os_cycles`, full cycle history |
| **Tools** | `negotiation-strategy` (existing edge fn), milestone logger |
| **Writes** | `milestones`, `career_os_cycles` (status=complete, new cycle created), `career_os_event_log` |
| **Output** | `{ achievement_record, next_cycle_seed: { goal, baseline_skills[] } }` |
| **→ Next** | New `career_os_cycles` row → back to `evaluate` at higher level |

---

## 5. Orchestration State Machine

```
career_os_cycles.current_stage transitions:

  [start] → evaluate
  evaluate → advise
  advise   → learn | act           (branch on gap_severity)
  learn    → act
  act      → coach
  coach    → achieve | act          (branch on offer received)
  achieve  → [new cycle: evaluate]

Each transition:
  1. Agent writes result to career_os_stages
  2. Logs event to career_os_event_log
  3. Updates career_os_cycles.current_stage
  4. Triggers next agent (webhook or pg_cron)
```

---

## 6. Data Flow: Resume → Agent Context

```
Resume Upload (PDF/Word/TXT)
  │
  ▼
/api/resume/extract-text          ← pure text extraction (pdf-parse / mammoth)
  │  rawText
  ▼
parseResumeLocally(rawText)        ← regex parser, zero AI
  │  ParsedResume { contact, experience[], education[], skills[], certs[] }
  ▼
resume_versions                    ← resume_text (raw) + parsed_data (JSONB)
  │
  ├──► user_profiles               ← auto-fill: name, phone, location, summary,
  │                                   current_position, skills (merged)
  │
  └──► agent-context bundle        ← injected into every agent system prompt
         │
         ├── Evaluate Agent  (skills gap vs target_roles)
         ├── Advise Agent    (career path + job matching)
         ├── Act Agent       (cover letter, outreach uses rawText)
         └── Coach Agent     (fit check uses rawText)
```

---

## 7. Tool Registry (Existing Edge Functions → Agent Tools)

| Agent | Tool | Edge Function | Status |
|---|---|---|---|
| Evaluate | skill-gap-analyzer | _to build_ | ❌ missing |
| Evaluate | market-fit-scorer | _to build_ | ❌ missing |
| Advise | career-path-analysis | `career-path-analysis` | ✅ exists |
| Advise | salary-projection | `salary-projection` | ✅ exists |
| Advise | search-jobs | `search-jobs` | ✅ exists |
| Learn | learning-insights | `learning-insights` | ✅ exists |
| Act | generate-cover-letter | `generate-cover-letter` | ✅ exists |
| Act | generate-outreach | `generate-outreach` | ✅ exists |
| Act | rewrite-resume | `/api/resume/rewrite` | ✅ exists |
| Coach | mock-interview | `mock-interview` | ✅ exists |
| Coach | fit-check | `fit-check` | ✅ exists |
| Coach | generate-interview-prep | `generate-interview-prep` | ✅ exists |
| Coach | negotiation-strategy | `negotiation-strategy` | ✅ exists |
| Achieve | negotiation-strategy | `negotiation-strategy` | ✅ exists |
| All | agent-context | _to build_ | ❌ missing |
| All | log-event | writes to career_os_event_log | ❌ missing |

**Gap summary:** 4 new edge functions needed: `agent-context`, `skill-gap-analyzer`, `market-fit-scorer`, `log-agent-event`.

---

## 8. Agent Memory Model

```
┌─────────────────────────────────────────────────────────┐
│  SHORT-TERM  (context window, per request)               │
│  System prompt: agent role + user context bundle         │
│  Human turn: user input / trigger event                  │
│  Assistant turn: structured JSON output                  │
└─────────────────────────────────────────────────────────┘
              ▼ persisted after each turn
┌─────────────────────────────────────────────────────────┐
│  EPISODIC  (career_os_event_log, analysis_history)       │
│  What happened, when, what the agent decided             │
│  Summarized into next agent's context (last 10 events)   │
└─────────────────────────────────────────────────────────┘
              ▼ ground truth, always fresh
┌─────────────────────────────────────────────────────────┐
│  LONG-TERM  (user_profiles + resume_versions)            │
│  Structured facts about the user                         │
│  Updated by agents via tool calls (never direct SQL)     │
└─────────────────────────────────────────────────────────┘
```

---

## 9. Architecture Decision Records (ADRs)

### ADR-001: Local resume parsing, no AI extraction
- **Decision:** Use regex/heuristic parser (parseResumeLocally) for resume text extraction
- **Rationale:** Eliminates 401 API errors, zero cost, deterministic, fast (<50ms)
- **Trade-off:** Lower accuracy on unusual resume formats vs AI extraction
- **Revisit when:** >20% of users report missing field auto-fills

### ADR-002: Supabase Edge Functions as agent tool endpoints
- **Decision:** Each agent tool is a Supabase Edge Function invoked via `supabase.functions.invoke()`
- **Rationale:** Consistent auth context (JWT), co-located with DB, streaming support for SSE tools
- **Trade-off:** Cold starts (~400ms) vs always-warm compute
- **Alternative considered:** Next.js API routes — rejected because agents run server-side and need direct DB access

### ADR-003: career_os_cycles as agent state machine
- **Decision:** `current_stage` column drives which agent runs; transitions logged to `career_os_event_log`
- **Rationale:** Durable state survives crashes; human-readable; queryable for analytics
- **Trade-off:** Tight coupling between DB schema and agent logic
- **Migration path:** Extract to a workflow engine (Temporal/Inngest) when cycle complexity grows

### ADR-004: User Context Bundle injected into every agent
- **Decision:** Single `/api/agent/context` assembles profile + resume + cycle state
- **Rationale:** Agents are stateless; context bundle is their only memory input
- **Trade-off:** Larger context tokens per request (~2-4k tokens)
- **Optimization:** Cache context bundle for 60s; invalidate on profile save or resume upload

---

## 10. Observability Plan

| Signal | Tool | Target |
|---|---|---|
| Agent latency P95 | Langfuse traces | <3s per agent turn |
| Token cost per cycle | Langfuse cost tracking | <$0.10 per full cycle |
| Stage completion rate | `career_os_event_log` analytics | >80% reach Achieve |
| Resume auto-fill accuracy | User edit rate on profile fields | <30% edited after import |
| Hallucination rate | LLM-as-judge on Advise output | <5% factual errors |

---

## 11. Build Sequence (SDLC Phase Plan)

| Sprint | Deliverable | Unlocks |
|---|---|---|
| **Now (done)** | resume_versions + parsed_data, user_profiles full fields, auto-fill | Agent context data is complete |
| **Sprint 1** | `agent-context` edge function + `log-agent-event` | Shared foundation for all agents |
| **Sprint 2** | Evaluate Agent + `skill-gap-analyzer` | First agent in cycle live |
| **Sprint 3** | Advise Agent (wraps career-path-analysis + search-jobs) | Full E→A slice |
| **Sprint 4** | Act Agent (cover letter + outreach, confirm before send) | First real-world actions |
| **Sprint 5** | Coach Agent (fit-check + mock-interview integration) | Full coaching loop |
| **Sprint 6** | Achieve Agent + cycle restart logic | Full cycle end-to-end |
| **Sprint 7** | Langfuse observability + eval golden set | Production hardening |

---

## 12. What's Built Today That's Agent-Ready

| Component | Agent Use |
|---|---|
| `user_profiles` (full fields) | Long-term memory for all agents |
| `resume_versions.rawText` | Act + Coach agents use as primary resume input |
| `resume_versions.parsed_data` | Evaluate agent skill gap input |
| `career_os_cycles.current_stage` | State machine — drives which agent runs |
| `career_os_event_log` | Episodic memory feed |
| `fit-check` edge fn | Coach agent tool ✅ |
| `mock-interview` edge fn | Coach agent tool ✅ |
| `career-path-analysis` edge fn | Advise agent tool ✅ |
| `generate-cover-letter` edge fn | Act agent tool ✅ |
| `negotiation-strategy` edge fn | Achieve agent tool ✅ |
| `agent_runs` table | Execution history for all agents ✅ |

