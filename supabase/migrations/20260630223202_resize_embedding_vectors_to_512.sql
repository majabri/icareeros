-- 2026-06-28 — Resize embedding vectors from 1536 (OpenAI text-embedding-3-small)
-- to 512 (local TF-IDF model). See PR #__ (replace once known) and brief
-- "Platform Cowork — Semantic Score: Zero-Cost Implementation".
--
-- Data-loss risk: NONE. Pre-migration row counts on prod (2026-06-28):
--   career_profiles: 3 rows total, 0 with embeddings
--   job_embeddings:  0 rows total
-- (The feature shipped in PR #334 was gated on OPENAI_API_KEY which was
-- never provisioned, so no embeddings were ever generated.)

-- Drop ivfflat indexes — required before altering the underlying vector type.
DROP INDEX IF EXISTS public.career_profiles_embedding_idx;
DROP INDEX IF EXISTS public.job_embeddings_embedding_idx;

-- Alter column dimensions
ALTER TABLE public.career_profiles
  ALTER COLUMN embedding TYPE vector(512);

ALTER TABLE public.job_embeddings
  ALTER COLUMN embedding TYPE vector(512);

-- Recreate indexes against the resized columns.
CREATE INDEX career_profiles_embedding_idx
  ON public.career_profiles
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX job_embeddings_embedding_idx
  ON public.job_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
