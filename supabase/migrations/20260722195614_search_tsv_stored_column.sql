-- feat/platform-search-tsv-stored-column — replace the expression-based GIN
-- index with a stored generated tsvector column + column-level GIN.
--
-- After #395's expression GIN index landed, the warm "python engineer" query
-- was ~660 ms. Bottleneck: the Bitmap Heap Scan recheck rebuilds
-- `to_tsvector(...)` per candidate row (383 rows × ~1.7 ms each ≈ 656 ms).
-- GIN indexes on tsvector *expressions* are lossy, so Postgres cannot serve
-- the filter from the index alone — it must rebuild the tsvector during
-- recheck.
--
-- Fix: materialise the tsvector into a STORED generated column, put the GIN
-- index on that column. The filter becomes `search_tsv @@ tsq` — a direct
-- column reference. Recheck reads the pre-computed tsvector; no rebuild.
--
-- Acceptance:
--   warm "python engineer" query < 100 ms
--   EXPLAIN plan shows NO tsvector rebuild in the Bitmap Heap Scan recheck
--
-- Migration order:
--   1. ALTER TABLE ADD COLUMN — rewrites the whole table because STORED
--      generated columns compute per-row values at write time. ACCESS
--      EXCLUSIVE lock for ~30-60 s on the current 61,642 active rows.
--      ats_jobs writes are cron-driven (~every 4 h from ingest-ats-direct
--      + enrich-jobs), so this brief lock is acceptable during a low-write
--      window. Storage cost ~100 MB (avg tsvector ~1-2 KB per row).
--   2. CREATE INDEX on the stored column.
--   3. CREATE OR REPLACE FUNCTION — atomically swap the RPC to reference
--      j.search_tsv directly (this is what unlocks the index).
--   4. DROP the old expression index — safe once step 3 lands because no
--      other query in the codebase references the old expression.

-- ── 1. STORED generated tsvector column ────────────────────────────────
--
-- The expression below MUST BE BYTE-IDENTICAL to what the RPC below reads.
-- (Postgres does not require literal string equality between the generated
-- column expression and query expressions to use the index — the index is
-- ON A COLUMN, so any query that references the column can use it. But
-- keeping the expression identical means the STORED value equals what the
-- old RPC would have computed on the fly, so behaviour is unchanged. If
-- you change one, mirror it on the other.)

ALTER TABLE public.ats_jobs
  ADD COLUMN search_tsv tsvector
    GENERATED ALWAYS AS (
      to_tsvector('english', title || ' ' || COALESCE(description, ''))
    ) STORED;

COMMENT ON COLUMN public.ats_jobs.search_tsv IS
  'Auto-generated tsvector on title || description. Backs '
  'idx_ats_jobs_search_tsv_stored and is referenced directly by '
  'search_jobs_ranked. Expression MUST be byte-identical to the one '
  'search_jobs_ranked was ported from (see feat/platform-search-tsv-stored-column). '
  'If you change one, mirror it on the other.';


-- ── 2. GIN index on the stored column ──────────────────────────────────
--
-- Simple column reference (not an expression) — planner will match any
-- WHERE `search_tsv @@ tsq` predicate exactly, no expression matching needed.

CREATE INDEX IF NOT EXISTS idx_ats_jobs_search_tsv_stored
  ON public.ats_jobs
  USING GIN (search_tsv);

COMMENT ON INDEX public.idx_ats_jobs_search_tsv_stored IS
  'GIN index on the stored generated tsvector column ats_jobs.search_tsv. '
  'Replaces the expression-based idx_ats_jobs_search_tsv from #395 (lossy '
  'recheck, ~660 ms warm). No recheck-rebuild needed with the stored column.';


-- ── 3. Swap the RPC to reference the stored column ─────────────────────
--
-- Signature, param list, filter surface, return shape, LIMIT/OFFSET math
-- all unchanged. Only the two tsvector-computation sites change:
--   OLD:  to_tsvector('english', j.title || ' ' || COALESCE(j.description, ''))
--   NEW:  j.search_tsv
-- referenced in both the WHERE filter AND the ts_rank in the SELECT.

CREATE OR REPLACE FUNCTION public.search_jobs_ranked(
  p_query           text,
  p_location        text     DEFAULT NULL,
  p_remote          boolean  DEFAULT NULL,
  p_employment_type text     DEFAULT NULL,
  p_company         text     DEFAULT NULL,
  p_sources         text[]   DEFAULT NULL,
  p_department      text     DEFAULT NULL,
  p_salary_min      integer  DEFAULT NULL,
  p_limit           integer  DEFAULT 50,
  p_offset          integer  DEFAULT 0
)
RETURNS TABLE (
  id                 uuid,
  source             text,
  external_id        text,
  company            text,
  title              text,
  location           text,
  description        text,
  apply_url          text,
  direct_apply_url   text,
  salary_min         integer,
  salary_max         integer,
  salary_currency    text,
  employment_type    text,
  remote             boolean,
  department         text,
  posted_at          timestamptz,
  last_seen_at       timestamptz,
  extracted_skills   text[],
  extracted_seniority text,
  seniority_tier     text,
  rank               real,
  total_count        bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH q AS (
    SELECT websearch_to_tsquery('english', p_query) AS tsq
  ),
  matched AS (
    SELECT
      j.id, j.source, j.external_id, j.company, j.title, j.location,
      j.description, j.apply_url, j.direct_apply_url,
      j.salary_min, j.salary_max, j.salary_currency,
      j.employment_type, j.remote, j.department,
      j.posted_at, j.last_seen_at,
      j.extracted_skills, j.extracted_seniority, j.seniority_tier,
      ts_rank(j.search_tsv, q.tsq) AS rank
    FROM public.ats_jobs j
    CROSS JOIN q
    WHERE
      j.is_active = true
      AND j.enrichment_status = 'complete'
      AND j.search_tsv @@ q.tsq
      AND (
        p_location IS NULL
        OR (lower(p_location) = 'remote' AND j.remote = true)
        OR (lower(p_location) <> 'remote' AND j.location ILIKE '%' || p_location || '%')
      )
      AND (p_remote IS NULL OR j.remote = p_remote)
      AND (p_employment_type IS NULL OR j.employment_type = p_employment_type)
      AND (p_company IS NULL OR j.company ILIKE '%' || p_company || '%')
      AND (
        p_sources IS NULL
        OR cardinality(p_sources) = 0
        OR j.source = ANY (p_sources)
      )
      AND (p_department IS NULL OR j.department = p_department)
      AND (
        p_salary_min IS NULL
        OR p_salary_min <= 0
        OR j.salary_max >= p_salary_min
        OR j.salary_min >= p_salary_min
      )
  )
  SELECT
    m.*,
    COUNT(*) OVER () AS total_count
  FROM matched m
  ORDER BY m.rank DESC, m.posted_at DESC NULLS LAST
  LIMIT  GREATEST(1, LEAST(COALESCE(p_limit, 50), 100))
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
$$;

COMMENT ON FUNCTION public.search_jobs_ranked IS
  'Ranked search over ats_jobs. Mirrors the filter surface of '
  'src/app/api/jobs/search-db/route.ts applyFilters block. Reads '
  'ats_jobs.search_tsv (STORED generated column) so the filter is served '
  'from idx_ats_jobs_search_tsv_stored with no recheck-rebuild. Returns '
  'rows ordered by ts_rank DESC, posted_at DESC NULLS LAST, with '
  'total_count via COUNT(*) OVER () for pagination in one round trip. '
  'STABLE + SECURITY INVOKER: RLS applies under the caller''s role.';

GRANT EXECUTE ON FUNCTION public.search_jobs_ranked TO authenticated, service_role;


-- ── 4. Drop the old expression index ───────────────────────────────────
--
-- Safe once step 3 lands. The RPC no longer references the old
-- to_tsvector(...) expression, and no other query in the codebase does
-- either — search-db/route.ts uses .textSearch("title", ...) which is
-- a `title`-only tsvector (also unindexed pre-#395, still unindexed) —
-- unrelated to the title+description index we're removing here. When
-- Jobs swaps the route to call search_jobs_ranked (their follow-up),
-- everything goes through the stored column path.

DROP INDEX IF EXISTS public.idx_ats_jobs_search_tsv;
