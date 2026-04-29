-- Day 41: job_offers table for Offer Desk feature
-- Stores job offers with negotiation analysis results

CREATE TABLE IF NOT EXISTS job_offers (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company        TEXT        NOT NULL,
  role_title     TEXT        NOT NULL,
  base_salary    NUMERIC,
  total_comp     NUMERIC,
  equity         TEXT,
  bonus          TEXT,
  benefits       TEXT,
  deadline       DATE,
  status         TEXT        NOT NULL DEFAULT 'received'
                 CHECK (status IN ('received', 'negotiating', 'accepted', 'declined')),
  notes          TEXT,
  negotiation_result JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE job_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own offers"
  ON job_offers
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_job_offers_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_job_offers_updated_at
  BEFORE UPDATE ON job_offers
  FOR EACH ROW EXECUTE FUNCTION update_job_offers_updated_at();

-- Index for user queries
CREATE INDEX IF NOT EXISTS idx_job_offers_user_id ON job_offers(user_id, created_at DESC);
