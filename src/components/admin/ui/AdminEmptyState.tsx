/**
 * Sprint 4 W2-B — consistent empty state for admin tables/lists.
 */

export interface AdminEmptyStateProps {
  title:        string;
  description?: string;
  icon?:        React.ReactNode;
  action?:      React.ReactNode;
}

export default function AdminEmptyState({ title, description, icon, action }: AdminEmptyStateProps) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center dark:bg-[var(--surface-card,#162338)]/30 dark:border-[var(--surface-border,#243653)]">
      {icon && <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center text-gray-400 dark:text-gray-500">{icon}</div>}
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">{description}</p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
