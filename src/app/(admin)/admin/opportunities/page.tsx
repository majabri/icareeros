import { createClient } from "@supabase/supabase-js";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import AdminDataCard from "@/components/admin/ui/AdminDataCard";
import AdminTable from "@/components/admin/ui/AdminTable";
import AdminEmptyState from "@/components/admin/ui/AdminEmptyState";
import OpportunitiesQuickActions from "@/components/admin/OpportunitiesQuickActions";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Opportunities — iCareerOS Admin" };

function makeSvc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

interface SearchParams {
  source?:  string;
  company?: string;
  limit?:   string;
}

interface SourceRow {
  source:        string;
  total:         number;
  active:        number;
  last_ingest:   string | null;
  first_ingest:  string | null;
}

interface OpportunityRow {
  id:           string;
  title:        string;
  company:      string;
  location:     string | null;
  source:       string;
  source_id:    string | null;
  url:          string | null;
  posted_at:    string | null;
  first_seen_at: string;
  is_active:    boolean;
  source_type:  string | null;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000)     return "just now";
  if (ms < 3_600_000)  return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export default async function AdminOpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params  = await searchParams;
  const sourceF = params.source && params.source !== "all" ? params.source : null;
  const companyF = (params.company ?? "").trim().toLowerCase();
  const limit   = Math.min(Math.max(parseInt(params.limit ?? "50", 10) || 50, 25), 500);

  const svc = makeSvc();

  // Sources rollup (always grouped by source — small, fast, no filter)
  const { data: sourcesRaw } = await svc
    .from("opportunities")
    .select("source, first_seen_at, is_active");
  const sourceMap = new Map<string, { total: number; active: number; last: string | null; first: string | null }>();
  for (const r of sourcesRaw ?? []) {
    const k = (r.source as string | null) ?? "(null)";
    const m = sourceMap.get(k) ?? { total: 0, active: 0, last: null, first: null };
    m.total += 1;
    if (r.is_active) m.active += 1;
    const ts = r.first_seen_at as string;
    if (!m.last  || ts > m.last)  m.last  = ts;
    if (!m.first || ts < m.first) m.first = ts;
    sourceMap.set(k, m);
  }
  const sources: SourceRow[] = Array.from(sourceMap.entries())
    .map(([source, v]) => ({ source, total: v.total, active: v.active, last_ingest: v.last, first_ingest: v.first }))
    .sort((a, b) => b.total - a.total);

  // Browse: filtered + paginated opportunities
  let browseQuery = svc
    .from("opportunities")
    .select("id, title, company, location, source, source_id, url, posted_at, first_seen_at, is_active, source_type", { count: "exact" })
    .order("first_seen_at", { ascending: false })
    .limit(limit);
  if (sourceF) browseQuery = browseQuery.eq("source", sourceF);

  const { data: oppsRaw, count: filteredCount } = await browseQuery;
  let opps: OpportunityRow[] = (oppsRaw ?? []) as OpportunityRow[];
  if (companyF) {
    opps = opps.filter(o => (o.company ?? "").toLowerCase().includes(companyF));
  }

  const totalOpps   = sources.reduce((s, r) => s + r.total, 0);
  const activeOpps  = sources.reduce((s, r) => s + r.active, 0);
  const sourceCount = sources.length;
  const newestEver  = sources.reduce<string | null>((acc, r) => {
    if (!r.last_ingest) return acc;
    if (!acc || r.last_ingest > acc) return r.last_ingest;
    return acc;
  }, null);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 space-y-8">
      <AdminPageHeader
        title="Opportunities"
        description={
          <>
            {totalOpps} total · {activeOpps} active · {sourceCount} source{sourceCount === 1 ? "" : "s"} · last ingest {timeAgo(newestEver)}
          </>
        }
      />

      {/* ── KPI cards ───────────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminDataCard label="Total opportunities" value={totalOpps} delta={`${activeOpps} active / ${totalOpps - activeOpps} stale`} />
        <AdminDataCard label="Active sources"      value={sourceCount} delta="distinct ingest pipelines" />
        <AdminDataCard label="Latest ingest"       value={timeAgo(newestEver)} delta={newestEver ? new Date(newestEver).toLocaleDateString() : "—"} />
        <AdminDataCard label="Filtered view"       value={opps.length} delta={`limit ${limit}${filteredCount && filteredCount > limit ? ` / ${filteredCount} match` : ""}`} />
      </section>

      {/* ── Sources rollup + Quick actions ──────────────────────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-base font-semibold text-gray-800 dark:text-gray-200">
            Sources <span className="ml-2 text-xs font-normal text-gray-400">grouped by `opportunities.source`</span>
          </h2>
          {sources.length === 0 ? (
            <AdminEmptyState
              title="No opportunities ingested yet"
              description="The /api/cron/ingest-ats and /api/cron/discover-rss crons populate this table. Trigger a manual ingest via the Quick Actions panel."
            />
          ) : (
            <AdminTable
              rows={sources}
              rowKey={r => r.source}
              columns={[
                { key: "source", label: "Source", render: r => (
                  <a href={`/admin/opportunities?source=${encodeURIComponent(r.source)}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">
                    {r.source}
                  </a>
                )},
                { key: "total",  label: "Total",  render: r => <span className="tabular-nums">{r.total}</span> },
                { key: "active", label: "Active", render: r => (
                  <span className={r.active === r.total ? "text-emerald-700 dark:text-emerald-300 tabular-nums" : "text-amber-700 dark:text-amber-300 tabular-nums"}>
                    {r.active}
                  </span>
                )},
                { key: "last_ingest",  label: "Last ingest",  render: r => <span title={r.last_ingest ?? ""}>{timeAgo(r.last_ingest)}</span> },
                { key: "first_ingest", label: "First ingest", render: r => <span title={r.first_ingest ?? ""}>{timeAgo(r.first_ingest)}</span> },
              ]}
            />
          )}
        </div>

        <div>
          <h2 className="mb-3 text-base font-semibold text-gray-800 dark:text-gray-200">Quick actions</h2>
          <OpportunitiesQuickActions />
        </div>
      </section>

      {/* ── Browse / filter ─────────────────────────────────────────────── */}
      <section>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">
            Browse opportunities
            <span className="ml-2 text-xs font-normal text-gray-400">
              {opps.length}{filteredCount && filteredCount > opps.length ? ` of ${filteredCount}` : ""} shown
            </span>
          </h2>
          <form className="flex flex-wrap items-end gap-2" method="GET">
            <div>
              <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Source</label>
              <select
                name="source"
                defaultValue={sourceF ?? "all"}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
              >
                <option value="all">All sources</option>
                {sources.map(s => (
                  <option key={s.source} value={s.source}>{s.source} ({s.total})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Company contains</label>
              <input
                type="search"
                name="company"
                defaultValue={companyF}
                placeholder="acme"
                className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Limit</label>
              <select
                name="limit"
                defaultValue={String(limit)}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
              >
                {[25, 50, 100, 200, 500].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <button type="submit" className="rounded-md bg-brand-600 text-white px-4 py-2 text-sm font-medium hover:bg-brand-700">
              Apply
            </button>
          </form>
        </div>

        {opps.length === 0 ? (
          <AdminEmptyState title="No opportunities match" description="Adjust source or company filters, or increase the limit." />
        ) : (
          <AdminTable
            rows={opps}
            rowKey={o => o.id}
            columns={[
              { key: "title",   label: "Title",   render: o => (
                <div>
                  <div className="font-medium text-gray-900 dark:text-gray-100 line-clamp-1 max-w-md">{o.title}</div>
                  {o.url && <a href={o.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-brand-600 hover:underline dark:text-brand-300">open posting ↗</a>}
                </div>
              )},
              { key: "company", label: "Company", render: o => o.company },
              { key: "source",  label: "Source",  render: o => (
                <code className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{o.source ?? "—"}</code>
              )},
              { key: "location", label: "Location", className: "text-xs", render: o => o.location ?? "—" },
              { key: "first_seen_at", label: "Ingested", className: "whitespace-nowrap", render: o => (
                <span className="text-xs" title={o.first_seen_at}>{timeAgo(o.first_seen_at)}</span>
              )},
              { key: "is_active", label: "Status", render: o => (
                <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${o.is_active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"}`}>
                  {o.is_active ? "active" : "stale"}
                </span>
              )},
            ]}
          />
        )}
      </section>
    </div>
  );
}
