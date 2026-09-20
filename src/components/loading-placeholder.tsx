export function LoadingPlaceholder({ label = "正在加载文档…", compact = false }: { label?: string; compact?: boolean }) {
  return <div className={`loading-placeholder${compact ? " is-compact" : ""}`} role="status" aria-live="polite">
    <span className="loading-label">{label}</span>
    <div className="loading-lines" aria-hidden="true">
      {!compact && <div className="skeleton skeleton-title" />}
      <div className="skeleton" /><div className="skeleton" /><div className="skeleton skeleton-short" />
      <div className="skeleton skeleton-section" /><div className="skeleton" /><div className="skeleton skeleton-short" />
    </div>
  </div>;
}
