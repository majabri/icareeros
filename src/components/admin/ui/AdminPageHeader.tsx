/**
 * Sprint 4 W2-B — page header pattern for /admin/* pages.
 * Title + optional description + optional action slot (buttons / filters).
 */

export interface AdminPageHeaderProps {
  title:       string;
  description?: string;
  actions?:    React.ReactNode;
}

export default function AdminPageHeader({ title, description, actions }: AdminPageHeaderProps) {
  return (
    <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-2xl">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
