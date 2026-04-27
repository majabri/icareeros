# Data Mapping — azjobs → iCareerOS

**Date:** 2026-04-27
**Source repo:** github.com/majabri/azjobs (production platform)
**Target repo:** github.com/majabri/icareeros (Next.js rebuild)

This document maps every table from the azjobs Supabase schema to its
iCareerOS equivalent, notes required schema changes, and defines the
migration strategy.

---

## Migration Strategy

1. **Week 2** — Create iCareerOS Supabase project (staging first).
   Run all 20 foundation migrations copied in Day 2.
2. **Week 3** — Port remaining 86 azjobs migrations, applying renames below.
3. **Week 4** — Backfill / sync live data from azjobs prod to iCareerOS staging.
4. **Go-live** — Switch DNS; azjobs prod becomes read-only archive.

All migrations go in `src/migrations/` (local) and are applied via
`supabase db push` to each environment in order.

---

## Table Inventory (86 tables in azjobs)

### IDENTITY — Keep as-is

| azjobs table | iCareerOS table | Notes |
|---|---|---|
| profiles | profiles | Core user profile — no change |
| user_roles | user_roles | Admin / job_seeker / hiring_manager |
| user_preferences | user_preferences | Theme, notifications, search defaults |
| email_preferences | email_preferences | Digest, alerts, marketing opt-in |
| invitations | invitations | Invite-code system |
| talent_invites | talent_invites | Gig marketplace invites |
| audit_log | audit_log | Admin audit trail |
| admin_logs | admin_logs | System event log |
| admin_settings | admin_settings | Platform-wide config |
| admin_alerts | admin_alerts | Ops alerts |
| admin_command_log | admin_command_log | admin-command edge fn log |
| feature_flags | feature_flags | Feature gating |
| service_health | service_health | Edge fn health checks |
| service_events | service_events | Event bus persistence |
| platform_events | platform_events | Analytics events |
| notifications | notifications | In-app notifications |

### OPPORTUNITIES — Renamed (job → opportunity)

| azjobs table | iCareerOS table | Schema changes |
|---|---|---|
| jobs | opportunities | Rename table + FK refs |
| raw_jobs | raw_opportunities | Rename |
| extracted_jobs | extracted_opportunities | Rename |
| deduplicated_jobs | deduplicated_opportunities | Rename |
| discovery_jobs | discovery_opportunities | Rename |
| processing_jobs | processing_opportunities | Rename |
| job_scores | opportunity_scores | Rename; add `os_cycle` enum col |
| job_interactions | opportunity_interactions | Rename |
| job_queue | opportunity_queue | Rename |
| job_applications | applications | Simplify name; add `cycle_id` FK |
| user_job_matches | user_opportunity_matches | Rename; add `career_os_stage` col |
| user_job_agents | user_opportunity_agents | Rename |
| ignored_jobs | ignored_opportunities | Rename |
| job_alerts | opportunity_alerts | Rename |
| job_benefits | opportunity_benefits | Rename |
| job_postings | job_postings | Keep (hiring manager creates these) |
| job_feed_log | feed_log | Simplify name |
| search_queries | search_queries | No change |
| search_presets | search_presets | No change |
| ingestion_runs | ingestion_runs | No change |
| ingestion_sources | ingestion_sources | No change |
| scraper_runs | scraper_runs | No change |
| discovery_company_sources | company_sources | Simplify name |
| domain_extraction_hints | domain_extraction_hints | No change |
| extraction_accuracy | extraction_accuracy | No change |
| extraction_feedback | extraction_feedback | No change |
| query_cache | query_cache | No change |
| skill_synonyms | skill_synonyms | No change |

### CAREER OS — New / extended

| azjobs table | iCareerOS table | Notes |
|---|---|---|
| *(new)* | career_os_cycles | Tracks each Evaluate→Achieve loop |
| *(new)* | career_os_stages | Stage checkpoints per cycle |
| *(new)* | career_goals | User-defined goals per cycle |
| analysis_history | analysis_history | Add `cycle_id` FK |
| agent_runs | agent_runs | Add `cycle_id` FK |
| recovery_attempts | recovery_attempts | No change |
| recovery_rules | recovery_rules | No change |
| milestones | milestones | Add `cycle_id` FK |

### RESUME & PROFILE

| azjobs table | iCareerOS table | Notes |
|---|---|---|
| resume_versions | resume_versions | No change |
| job_seeker_profiles | job_seeker_profiles | No change |
| employer_profiles | employer_profiles | No change |
| user_portfolio_items | user_portfolio_items | No change |
| user_salary_snapshots | user_salary_snapshots | No change |
| user_market_intel | user_market_intel | No change |
| user_interview_prep | user_interview_prep | No change |

### INTERVIEW & OFFERS

| azjobs table | iCareerOS table | Notes |
|---|---|---|
| interview_sessions | interview_sessions | No change |
| interview_schedules | interview_schedules | No change |
| offers | offers | No change |
| outreach_contacts | outreach_contacts | No change |
| referrals | referrals | No change |
| referral_tree | referral_tree | No change |

### LEARNING

| azjobs table | iCareerOS table | Notes |
|---|---|---|
| learning_events | learning_events | No change |
| benefits_catalog | benefits_catalog | No change |

### GIG MARKETPLACE

| azjobs table | iCareerOS table | Notes |
|---|---|---|
| gigs | gigs | No change |
| gig_bids | gig_bids | No change |
| gig_contracts | gig_contracts | No change |
| gig_reviews | gig_reviews | No change |
| projects | projects | No change |
| project_proposals | project_proposals | No change |
| proposal_queue | proposal_queue | No change |
| contracts | contracts | No change |
| service_catalog | service_catalog | No change |
| service_packages | service_packages | No change |
| service_reviews | service_reviews | No change |
| catalog_orders | catalog_orders | No change |
| talent_stripe_accounts | talent_stripe_accounts | No change |
| talent_payouts | talent_payouts | No change |
| ratings | ratings | No change |
| reviews | reviews | No change |
| helpful_votes | helpful_votes | No change |

### SUPPORT

| azjobs table | iCareerOS table | Notes |
|---|---|---|
| support_tickets | support_tickets | No change |
| ticket_messages | ticket_messages | No change |
| ticket_responses | ticket_responses | No change |
| support_faq | support_faq | No change |
| customer_surveys | customer_surveys | No change |

### HIRING MANAGER

| azjobs table | iCareerOS table | Notes |
|---|---|---|
| benchmark_reports | benchmark_reports | No change |

### ANALYTICS / REPORTING

| azjobs table | iCareerOS table | Notes |
|---|---|---|
| daily_audit_reports | daily_audit_reports | No change |
| review_reports | review_reports | No change |

---

## New Tables Required for iCareerOS Career OS Framework

```sql
-- career_os_cycles: one row per Evaluate→Achieve loop per user
CREATE TABLE career_os_cycles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cycle_number INT NOT NULL DEFAULT 1,
  goal         TEXT,
  status       TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','completed','abandoned')),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- career_os_stages: tracks progress through each stage of a cycle
CREATE TABLE career_os_stages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id   UUID NOT NULL REFERENCES career_os_cycles(id) ON DELETE CASCADE,
  stage      TEXT NOT NULL
              CHECK (stage IN ('evaluate','advise','learn','act','coach','achieve')),
  status     TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','in_progress','completed','skipped')),
  started_at TIMESTAMPTZ,
  ended_at   TIMESTAMPTZ,
  notes      JSONB
);
```

---

## FK Changes Required in Existing Tables

When renaming `jobs` → `opportunities`, update FK references in:
- `user_job_matches.job_id` → `user_opportunity_matches.opportunity_id`
- `job_applications.job_id` → `applications.opportunity_id`
- `job_interactions.job_id` → `opportunity_interactions.opportunity_id`
- `job_scores.job_id` → `opportunity_scores.opportunity_id`
- `ignored_jobs.job_id` → `ignored_opportunities.opportunity_id`

These will be handled as separate ALTER TABLE migrations in Week 2.

---

*Last updated: 2026-04-27 — Week 1 extraction complete.*
