-- Add devops_tier column so the classifier can emit L0/L1/L2/L3 per the user's policy:
--   L0 (single-bug debug) + L1 (live ops) → candidates for auto-action later.
--   L2 (build/feature) + L3 (architect)  → always human review at /admin/tickets.

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS devops_tier text
  CHECK (devops_tier IS NULL OR devops_tier = ANY (ARRAY['L0','L1','L2','L3']));

COMMENT ON COLUMN public.support_tickets.devops_tier IS
  'Classifier-assigned tier: L0=single-bug debug, L1=live ops, L2=feature/build, L3=architect. L0/L1 may auto-action; L2/L3 always human-reviewed.';

NOTIFY pgrst, 'reload schema';;
