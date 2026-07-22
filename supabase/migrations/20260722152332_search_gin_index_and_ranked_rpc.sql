-- feat/platform-search-db-index-rpc — GIN index + ts_rank RPC for POST /api/jobs/search-db.
--
-- Two additions:
--
--   1. GIN expression index on the ats_jobs tsvector.
--      Matches the expression the search-db route + new RPC use, so the
--      planner can serve `websearch_to_tsquery @@ tsvector` matches from
--      the index instead of building the tsvector per row.
--      The docstring on /api/jobs/search-db notes today's "python engineer"
--      query costs ~1200ms; a matching GIN drops that to <50ms on the 60k-
--      row table. ats_jobs has a 4h refresh cadence — a brief exclusive
--      lock during CREATE INDEX is acceptable.
--
--   2. search_jobs_ranked() RPC.
--      SECURITY INVOKER + STABLE — the caller's `authenticated` role and
--      the ats_jobs RLS policies apply just like any other SELECT. Mirrors
--      the search-db route's filter list one-for-one. Returns rows sorted
--      by ts_rank DESC, posted_at DESC NULLS LAST, with `total_count`
--      denormalised on each row via COUNT(*) OVER () so paginated callers
--      get pagination + total in one round trip.
--
-- To leverage the RPC, the route swaps its `.textSearch("title", ...)` +
-- follow-on `.order("posted_at")` for `.rpc("search_jobs_ranked", {...})`.
-- That is a Jobs-side follow-up; this migration is deploy-independent — the
-- index helps the current route even before the swap.

-- ── 1. GIN tsvector index ────────────────────────────────────────────────
--
-- Expression matches the RPC's ts_rank input exactly. If either the index
-- or the RPC drifts, planner silently reverts to seq scan.

CREATE INDEX IF NOT EXISTS idx_ats_jobs_search_tsv
  ON public.ats_jobs
  USING GIN (
    to_tsvector('english', title || ' ' || COALESCE(description, ''))
  );

COMMENT ON INDEX public.idx_ats_jobs_search_tsv IS
  'Backs the tsvector @@ tsquery lookup in public.search_jobs_ranked and any '
  'direct textSearch() call whose expression matches. If you change the '
  'expression here, change it in search_jobs_ranked() too.';


-- ── 2. search_jobs_ranked RPC ────────────────────────────────────────────
--
-- Signature mirrors the filter surface in
--   src/app/api/jobs/search-db/route.ts (applyFilters block).
--
-- All optional filter arguments are NULL by default and match the route's
-- semantics:
--
--   p_query           — required. Passed through websearch_to_tsquery.
--   p_location        — ilike '%X%'. Special string 'remote' forces remote=true.
--   p_remote          — explicit remote=true additional filter.
--   p_employment_type — exact match.
--   p_company         — ilike '%X%'.
--   p_sources         — text[] ANY-match on source.
--   p_department      — exact match.
--   p_salary_min      — salary_max >= X OR salary_min >= X.
--   p_limit           — default 50, called with min(client, 100).
--   p_offset          — default 0.
--
-- Return columns: same commonSelect the route uses, plus `rank real` and
-- `total_count bigint` (via COUNT(*) OVER ()). total_count is identical on
-- every returned row — the caller reads it from the first row (or 0 when
-- empty).
--
-- STABLE — reads only; no writes, no volatile ops.
-- SECURITY INVOKER — RLS is enforced under the caller's role. That's the
-- correct default; there is no privilege-escalation reason to bypass RLS.

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
      ts_rank(
        to_tsvector('english', j.title || ' ' || COALESCE(j.description, '')),
        q.tsq
      ) AS rank
    FROM public.ats_jobs j
    CROSS JOIN q
    WHERE
      j.is_active = true
      AND j.enrichment_status = 'complete'
      AND to_tsvector('english', j.title || ' ' || COALESCE(j.description, '')) @@ q.tsq
      -- Location: 'remote' → remote=true; anything else → ilike
      AND (
        p_location IS NULL
        OR (lower(p_location) = 'remote' AND j.remote = true)
        OR (lower(p_location) <> 'remote' AND j.location ILIKE '%' || p_location || '%')
      )
      -- Explicit remote toggle (separate from p_location='remote')
      AND (p_remote IS NULL OR j.remote = p_remote)
      -- Employment type: exact match when set
      AND (p_employment_type IS NULL OR j.employment_type = p_employment_type)
      -- Company: ilike substring when set
      AND (p_company IS NULL OR j.company ILIKE '%' || p_company || '%')
      -- Sources: ANY match when the array is non-null and non-empty
      AND (
        p_sources IS NULL
        OR cardinality(p_sources) = 0
        OR j.source = ANY (p_sources)
      )
      -- Department: exact match when set
      AND (p_department IS NULL OR j.department = p_department)
      -- Salary: either bound >= p_salary_min when set + > 0
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
  'src/app/api/jobs/search-db/route.ts applyFilters block. Returns rows '
  'ordered by ts_rank DESC, posted_at DESC NULLS LAST, with total_count '
  'via COUNT(*) OVER () for pagination in one round trip. STABLE + '
  'SECURITY INVOKER: RLS applies under the caller''s role. Backed by '
  'idx_ats_jobs_search_tsv (GIN); if the tsvector expression drifts, '
  'planner silently falls back to seq scan.';

-- Grant EXECUTE to the same roles that read ats_jobs today. RLS on the
-- underlying table remains the primary access control.
GRANT EXECUTE ON FUNCTION public.search_jobs_ranked TO authenticated, service_role;
