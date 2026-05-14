/**
 * Sprint 4 W2-B — minimal sortable / paginated admin table primitive.
 *
 * Stays small on purpose. Pages can provide custom rendering per column,
 * including row-action menus. Mobile renders as a stack of cards via
 * built-in `data-label` attributes and CSS.
 */

export interface AdminTableColumn<T> {
  key:        string;
  label:      string;
  /** Custom cell renderer. Default: String(row[key]) */
  render?:    (row: T) => React.ReactNode;
  className?: string;
}

export interface AdminTableProps<T> {
  rows:        T[];
  columns:     AdminTableColumn<T>[];
  /** Stable row key — falls back to JSON.stringify if not provided. */
  rowKey?:     (row: T) => string;
  emptyState?: React.ReactNode;
  isLoading?:  boolean;
}

export default function AdminTable<T>({
  rows, columns, rowKey, emptyState, isLoading,
}: AdminTableProps<T>) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 dark:bg-[var(--surface-card,#162338)] dark:border-[var(--surface-border,#243653)] dark:text-gray-400">
        Loading…
      </div>
    );
  }
  if (rows.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm dark:bg-[var(--surface-card,#162338)] dark:border-[var(--surface-border,#243653)]">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:bg-white/5 dark:text-gray-400">
          <tr>
            {columns.map(c => (
              <th key={c.key} className={`px-4 py-3 font-medium whitespace-nowrap ${c.className ?? ""}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-white/5">
          {rows.map((row, i) => (
            <tr key={rowKey ? rowKey(row) : String(i)} className="hover:bg-gray-50/50 dark:hover:bg-white/5">
              {columns.map(c => (
                <td key={c.key} className={`px-4 py-3 align-top text-gray-800 dark:text-gray-200 ${c.className ?? ""}`}>
                  {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
