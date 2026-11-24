import type { Meta, Phase } from "../types";

interface Stats {
  beforeGrade: number;
  afterGrade: number;
  checked: number;
  pending: number;
  flagged: number;
  seconds: number;
  words: number;
  entitiesTotal: number;
  entitiesPreserved: number;
}

function formatChrono(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${tenths}`;
}

export default function SummaryBar({
  stats,
  total,
  progressPct,
  phase,
  progress,
  meta,
  running,
  isPreview
}: {
  stats: Stats;
  total: number;
  progressPct: number;
  phase: Phase | null;
  progress: { done: number; total: number } | null;
  meta: Meta | null;
  running: boolean;
  isPreview: boolean;
}) {
  const drop = stats.beforeGrade - stats.afterGrade;
  const clamped = Math.max(0, Math.min(100, progressPct));
  const entityPct =
    stats.entitiesTotal > 0 ? Math.round((stats.entitiesPreserved / stats.entitiesTotal) * 100) : 100;

  const segments = 24;
  const filledSegments = Math.round((clamped / 100) * segments);

  let statusLine = "ALL SENTENCES VERIFIED";
  if (running) {
    if (phase === "write") {
      statusLine = `PHASE 01/02 · REWRITING SENTENCE ${Math.min(
        (progress?.done ?? 0) + 1,
        total || 1
      )} OF ${total} [${meta?.generator ?? "qwen2.5:3b"}]`;
    } else if (phase === "swap") {
      statusLine = `VRAM SWAP · LOADING ${meta?.verifier ?? "7B"} VERIFIER…`;
    } else if (phase === "verify") {
      statusLine = `PHASE 02/02 · VERIFYING MEANING ${Math.min(
        (progress?.done ?? 0) + 1,
        total || 1
      )} OF ${total} [${meta?.verifier ?? "qwen2.5:7b"}]`;
    } else {
      statusLine = "INITIALIZING LOCAL PIPELINE…";
    }
  } else if (meta?.mode === "fast") {
    statusLine = `COMPLETE · FAST MODE (${stats.checked} SENTENCES)`;
  }

  return (
    <section className="seiko-deck" aria-label="Telemetry summary">
      <div className="seiko-deck__bezel">
        <div className="seiko-deck__header">
          <div className="seiko-deck__brand">
            <span className={`lcd-led ${running ? "is-pulsing" : ""}`} aria-hidden="true" />
            <span>TELEMETRY</span>
            {isPreview && <span className="preview-tag">RECORDED SAMPLE</span>}
          </div>
          <div className="seiko-deck__mode">
            {meta?.targetGrade ? `TARGET G${meta.targetGrade}` : "TARGET G7–8"} ·{" "}
            {meta?.verifier ? "VERIFIED" : "FAST"}
          </div>
        </div>

        <div className="lcd-grid">
          <div className="lcd-cell lcd-cell--amber">
            <span className="lcd-cell__label">READING GRADE</span>
            <span className="lcd-cell__value">
              {stats.beforeGrade.toFixed(1)}
              <span className="lcd-arrow">→</span>
              {stats.afterGrade.toFixed(1)}
            </span>
            <span className="lcd-cell__sub">
              {drop > 0 ? `−${drop.toFixed(1)} grades easier` : "measuring…"}
            </span>
          </div>

          <div className="lcd-cell">
            <span className="lcd-cell__label">FACTS &amp; NUMBERS</span>
            <span className="lcd-cell__value lcd-cell__value--accent">
              {stats.entitiesTotal > 0 ? `${entityPct}%` : "100%"}
            </span>
            <span className="lcd-cell__sub">
              {stats.entitiesTotal > 0
                ? `${stats.entitiesPreserved}/${stats.entitiesTotal} preserved`
                : "no numeric claims"}
            </span>
          </div>

          <div className="lcd-cell">
            <span className="lcd-cell__label">SENTENCES</span>
            <span className="lcd-cell__value">
              {stats.checked}
              <span className="lcd-dim">/{total}</span>
            </span>
            <span className={`lcd-cell__sub ${stats.flagged > 0 ? "lcd-warn" : ""}`}>
              {stats.pending > 0
                ? `${stats.pending} awaiting check`
                : stats.flagged > 0
                  ? `${stats.flagged} needs review`
                  : "0 flagged"}
            </span>
          </div>

          <div className="lcd-cell">
            <span className="lcd-cell__label">TIME</span>
            <span className="lcd-cell__value lcd-chrono">{formatChrono(stats.seconds)}</span>
            <span className="lcd-cell__sub">{stats.words} words local</span>
          </div>
        </div>

        <div
          className="matrix-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(clamped)}
        >
          <div className="matrix-progress__meta">
            <span className="matrix-progress__status">{statusLine}</span>
            <span className="matrix-progress__pct">{Math.round(clamped)}%</span>
          </div>
          <div className="matrix-progress__bar" aria-hidden="true">
            {Array.from({ length: segments }).map((_, i) => {
              const active = i < filledSegments;
              const isHead = running && i === Math.max(0, filledSegments - 1);
              return (
                <span
                  key={i}
                  className={`matrix-seg ${active ? "is-on" : ""} ${isHead ? "is-head" : ""}`}
                />
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
