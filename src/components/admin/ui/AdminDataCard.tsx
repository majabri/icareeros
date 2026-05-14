/**
 * Sprint 4 W2-B — KPI card. Value + label + optional delta + optional sparkline slot.
 */

export interface AdminDataCardProps {
  label:     string;
  value:     string | number;
  /** e.g. "+12 this week" or "-3% MoM". Rendered green/red by sign of first char if numeric-looking. */
  delta?:    string;
  /** Sparkline / chart slot (recharts <Sparkline> or SVG). Optional. */
  sparkline?: React.ReactNode;
  /** Optional href — turns the card into a link. */
  href?:     string;
}

function deltaColor(delta?: string): string {
  if (!delta) return "";
  const trimmed = delta.trim();
  if (trimmed.startsWith("+")) return "text-emerald-700 dark:text-emerald-400";
  if (trimmed.startsWith("-")) return "text-rose-700 dark:text-rose-400";
  return "text-gray-500 dark:text-gray-400";
}

export default function AdminDataCard({ label, value, delta, sparkline, href }: AdminDataCardProps) {
  const inner = (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:bg-[var(--surface-card,#162338)] dark:border-[var(--surface-border,#243653)] dark:shadow-none">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="text-3xl font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{value}</div>
        {sparkline && <div className="w-24 h-10">{sparkline}</div>}
      </div>
      {delta && <div className={`mt-1 text-xs font-medium ${deltaColor(delta)}`}>{delta}</div>}
    </div>
  );
  if (href) {
    return <a href={href} className="block hover:opacity-90 transition-opacity">{inner}</a>;
  }
  return inner;
}
