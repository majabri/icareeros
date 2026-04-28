-- Day 8: Event logging schema extension + career_os_event_log view
ALTER TABLE public.career_os_stages
  ADD COLUMN IF NOT EXISTS event_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_event_at TIMESTAMPTZ;

CREATE OR REPLACE VIEW public.career_os_event_log AS
SELECT
  cy.id AS cycle_id, cy.user_id, cy.cycle_number, cy.goal AS cycle_goal,
  cy.status AS cycle_status, cy.started_at AS cycle_started_at, cy.completed_at AS cycle_completed_at,
  st.id AS stage_id, st.stage, st.status AS stage_status,
  st.started_at AS stage_started_at, st.ended_at AS stage_ended_at,
  st.event_count, st.last_event_at, st.notes
FROM public.career_os_cycles cy
LEFT JOIN public.career_os_stages st ON st.cycle_id = cy.id
ORDER BY cy.cycle_number, cy.created_at, st.created_at;
