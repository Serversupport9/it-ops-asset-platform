export default function PageHeader({
  title,
  description,
  actions,
  count,
  countLabel = "total",
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** Total record count for the table this page shows - rendered as a pill next to the title so
   * it's visible without scrolling to the pagination footer. Omit while the count is still loading. */
  count?: number;
  countLabel?: string;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">{title}</h1>
          {count !== undefined && (
            <span className="inline-flex items-center rounded-full bg-gradient-to-r from-blue-600 to-sky-500 px-3 py-1 text-xs font-semibold text-white shadow-sm shadow-blue-500/30">
              {count} {countLabel}
            </span>
          )}
        </div>
        {description && <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
