-- App code (src/services/supportService.ts) sends 'low' | 'normal' | 'high' | 'urgent'.
-- The day10 CHECK only allowed 'low' | 'medium' | 'high' | 'urgent'.
-- Replace the constraint with the full union of both vocabularies so neither path breaks.

ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_priority_check;

ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_priority_check
  CHECK (priority = ANY (ARRAY['low','normal','medium','high','urgent']));

NOTIFY pgrst, 'reload schema';;
