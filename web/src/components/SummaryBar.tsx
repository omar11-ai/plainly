interface Stats {
  beforeGrade: number;
  afterGrade: number;
  checked: number;
  pending: number;
  flagged: number;
  seconds: number;
  words: number;
}

export default function SummaryBar({
  stats,
  total,
  progressPct
}: {
  stats: Stats;
  total: number;
  progressPct: number;
}) {
  const drop = stats.beforeGrade - stats.afterGrade;
  const progress = Math.max(0, Math.min(100, progressPct));

  return (
    <section className="summary" aria-label="Summary">
      <div className="summary__grid">
        <div className="stat">
          <p className="stat__label">Reading grade</p>
          <p className="stat__value">
            {stats.beforeGrade.toFixed(1)}
            <span className="stat__arrow" aria-hidden="true">
              →
            </span>
            {stats.afterGrade.toFixed(1)}
          </p>
          <p className="stat__hint">
            {drop > 0 ? `${drop.toFixed(1)} grades easier` : "no change yet"}
          </p>
        </div>
        <div className="stat">
          <p className="stat__label">Sentences checked</p>
          <p className="stat__value">
            {stats.checked}
            <span className="stat__sub">/ {total}</span>
          </p>
          <p className="stat__hint">
            {stats.pending > 0 ? `${stats.pending} awaiting the check` : `${stats.words} words in`}
          </p>
        </div>
        <div className="stat">
          <p className="stat__label">Needs review</p>
          <p className={`stat__value ${stats.flagged > 0 ? "stat__value--warn" : ""}`}>
            {stats.flagged}
          </p>
          <p className="stat__hint">
            {stats.checked > 0
              ? `${Math.round(((stats.checked - stats.flagged) / stats.checked) * 100)}% passed the check`
              : "waiting for the first result"}
          </p>
        </div>
        <div className="stat">
          <p className="stat__label">Time</p>
          <p className="stat__value">{stats.seconds.toFixed(0)}s</p>
          <p className="stat__hint">on this machine</p>
        </div>
      </div>

      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
        <div className="progress__fill" style={{ width: `${progress}%` }} />
      </div>
    </section>
  );
}
