-- Fix: app code writes to support_tickets.body but the live table only has `description`
-- (the day45 migration was a no-op because day10 already created the table).
-- Restore the body column to match the app code in src/app/api/support/route.ts.

-- 1. Add the missing body column the API needs.
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS body text;

-- 2. Backfill from description so any pre-existing rows stay readable.
UPDATE public.support_tickets
   SET body = description
 WHERE body IS NULL AND description IS NOT NULL;

-- 3. Make description nullable so future inserts that only set body succeed.
ALTER TABLE public.support_tickets
  ALTER COLUMN description DROP NOT NULL;

-- 4. Enforce the same length validation the API enforces (10..5000), but only
--    on rows where body is provided, so old rows aren't broken.
ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_body_length;
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_body_length
  CHECK (body IS NULL OR char_length(body) BETWEEN 10 AND 5000);

-- 5. Add admin_notes (used by the upcoming auto-resolver — see Audit_Support_Autonomous_Loop_2026-04-30.md).
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS admin_notes text;

-- 6. Tell PostgREST to reload its schema cache so the API stops 404-ing on `body`.
NOTIFY pgrst, 'reload schema';;
