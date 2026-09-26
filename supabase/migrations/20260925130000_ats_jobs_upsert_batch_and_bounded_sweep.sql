-- ─────────────────────────────────────────────────────────────────────────
-- #453 — ats_jobs refresh silently failing since 2026-09-16
--
-- Every ingest upsert goes through PostgREST as `authenticator`, which carries
-- statement_timeout=8s. A whole-company upsert of several hundred rows, each
-- of which rewrites `raw` + `last_seen_at` on a row that has NOT changed,
-- forces a non-HOT update (97.7% of updates on this table are non-HOT) and
-- re-inserts 13 index entries per row including the 119 MB GIN on the
-- generated `search_tsv`. The large employers crossed 8 s on 2026-09-16 and
-- have not been refreshed since. The 48 h sweep times out the same way and
-- its error was swallowed.
--
-- This migration adds two SECURITY DEFINER functions the edge function calls
-- via RPC:
--
--   ats_jobs_upsert_batch(p_rows jsonb)
--     INSERT … ON CONFLICT DO UPDATE only WHERE the row actually changed
--     (raw / title / is_active). Rows present in the feed but unchanged get a
--     narrow `last_seen_at` bump instead — last_seen_at is in no index, so
--     with fillfactor headroom that is a HOT update: no index maintenance.
--     Returns counts so the caller can report what it did.
--
--   ats_jobs_sweep_stale(p_cutoff_hours int, p_limit int)
--     Bounded, board-aware deactivation. A row is deactivated only when
--     (a) it has not been seen for p_cutoff_hours AND (b) its own board
--     (source + company) HAS been seen within the window — i.e. we crawled
--     that board and the job was not in it. A board we failed to crawl at all
--     is OUR failure, not evidence the jobs are gone, and is left alone. That
--     rule is what makes it safe to turn the sweep on while 70% of the
--     catalog is stale from the refresh outage: only boards that are
--     refreshing again get swept. LIMIT keeps each call well under 8 s.
--
-- Also lowers fillfactor so the narrow last_seen_at update has page room to
-- be HOT. Applies to pages written from now on; existing pages catch up as
-- rows are rewritten.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.ats_jobs SET (fillfactor = 85);

CREATE OR REPLACE FUNCTION public.ats_jobs_upsert_batch(p_rows jsonb)
RETURNS TABLE (inserted integer, updated integer, touched integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
  v_updated  integer := 0;
  v_touched  integer := 0;
BEGIN
  -- Stage the batch once. DISTINCT ON guards against a feed that lists the
  -- same apply_url twice, which would otherwise raise "ON CONFLICT DO UPDATE
  -- command cannot affect row a second time".
  CREATE TEMP TABLE IF NOT EXISTS _ats_batch (
    source           text,
    external_id      text,
    company          text,
    title            text,
    location         text,
    description      text,
    apply_url        text,
    employment_type  text,
    posted_at        timestamptz,
    remote           boolean,
    raw              jsonb,
    enrichment_status text
  ) ON COMMIT DROP;
  TRUNCATE _ats_batch;

  INSERT INTO _ats_batch
  SELECT DISTINCT ON (r.source, r.apply_url)
         r.source, r.external_id, r.company, r.title, r.location, r.description,
         r.apply_url, r.employment_type, r.posted_at, r.remote, r.raw, r.enrichment_status
  FROM jsonb_to_recordset(p_rows) AS r(
         source text, external_id text, company text, title text, location text,
         description text, apply_url text, employment_type text, posted_at timestamptz,
         remote boolean, raw jsonb, enrichment_status text)
  WHERE r.source IS NOT NULL AND r.apply_url IS NOT NULL AND r.apply_url <> '';

  -- 1. Insert new rows; update existing rows only when something material
  --    changed. `description` / `employment_type` / `posted_at` /
  --    `enrichment_status` keep the stored value when the feed omits them
  --    (Greenhouse + Workday deliberately omit description — see #418).
  WITH ins AS (
    INSERT INTO public.ats_jobs (
      source, external_id, company, title, location, description, apply_url,
      employment_type, posted_at, remote, raw, last_seen_at, is_active, enrichment_status)
    SELECT b.source, b.external_id, b.company, b.title, b.location, b.description, b.apply_url,
           b.employment_type, b.posted_at, COALESCE(b.remote, false), b.raw, now(), true,
           COALESCE(b.enrichment_status, 'pending')
    FROM _ats_batch b
    ON CONFLICT (source, apply_url) DO UPDATE SET
      external_id       = EXCLUDED.external_id,
      company           = EXCLUDED.company,
      title             = EXCLUDED.title,
      location          = EXCLUDED.location,
      description       = COALESCE(EXCLUDED.description, public.ats_jobs.description),
      employment_type   = COALESCE(EXCLUDED.employment_type, public.ats_jobs.employment_type),
      posted_at         = COALESCE(EXCLUDED.posted_at, public.ats_jobs.posted_at),
      remote            = EXCLUDED.remote,
      raw               = EXCLUDED.raw,
      last_seen_at      = now(),
      is_active         = true,
      enrichment_status = COALESCE(EXCLUDED.enrichment_status, public.ats_jobs.enrichment_status)
    WHERE public.ats_jobs.raw      IS DISTINCT FROM EXCLUDED.raw
       OR public.ats_jobs.title    IS DISTINCT FROM EXCLUDED.title
       OR public.ats_jobs.location IS DISTINCT FROM EXCLUDED.location
       OR public.ats_jobs.is_active = false
    RETURNING (xmax = 0) AS is_insert
  )
  SELECT COUNT(*) FILTER (WHERE is_insert),
         COUNT(*) FILTER (WHERE NOT is_insert)
    INTO v_inserted, v_updated
  FROM ins;

  -- 2. Rows present in the feed and unchanged: bump last_seen_at only.
  --    Skipped for rows that step 1 already wrote (their last_seen_at is now()).
  UPDATE public.ats_jobs a
     SET last_seen_at = now()
    FROM _ats_batch b
   WHERE a.source = b.source
     AND a.apply_url = b.apply_url
     AND a.last_seen_at < now() - interval '1 minute';
  GET DIAGNOSTICS v_touched = ROW_COUNT;

  RETURN QUERY SELECT v_inserted, v_updated, v_touched;
END;
$$;

REVOKE ALL ON FUNCTION public.ats_jobs_upsert_batch(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ats_jobs_upsert_batch(jsonb) TO service_role;

COMMENT ON FUNCTION public.ats_jobs_upsert_batch(jsonb) IS
  '#453 — change-aware batch upsert for ingest-ats-direct. Full update only when raw/title/location changed; otherwise a narrow last_seen_at bump. Call with <=100 rows per batch to stay under the PostgREST 8s statement_timeout.';

CREATE OR REPLACE FUNCTION public.ats_jobs_sweep_stale(p_cutoff_hours integer DEFAULT 48, p_limit integer DEFAULT 2000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  WITH fresh_boards AS (
    SELECT source, company
      FROM public.ats_jobs
     WHERE is_active
       AND last_seen_at >= now() - make_interval(hours => p_cutoff_hours)
     GROUP BY source, company
  ),
  victims AS (
    SELECT a.id
      FROM public.ats_jobs a
      JOIN fresh_boards f ON f.source = a.source AND f.company = a.company
     WHERE a.is_active
       AND a.last_seen_at < now() - make_interval(hours => p_cutoff_hours)
     ORDER BY a.last_seen_at
     LIMIT GREATEST(p_limit, 0)
  ),
  upd AS (
    UPDATE public.ats_jobs a
       SET is_active = false
      FROM victims v
     WHERE a.id = v.id
    RETURNING a.id
  )
  SELECT COUNT(*) INTO v_count FROM upd;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.ats_jobs_sweep_stale(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ats_jobs_sweep_stale(integer, integer) TO service_role;

COMMENT ON FUNCTION public.ats_jobs_sweep_stale(integer, integer) IS
  '#453 — bounded, board-aware deactivation of ats_jobs not seen for p_cutoff_hours. Only sweeps boards (source+company) that were themselves crawled inside the window, so a board we failed to refresh is never mass-deactivated. Returns rows deactivated.';
