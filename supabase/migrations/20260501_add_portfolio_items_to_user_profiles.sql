ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS portfolio_items jsonb NOT NULL DEFAULT '[]'::jsonb;
