import { useEffect, useState } from "react";
import type { Health, Phase, ProtectOptions, ReadingLevel } from "../types";

interface Props {
  health: Health | null;
  mode: "verified" | "fast";
  level: ReadingLevel;
  protect: ProtectOptions;
  running: boolean;
  phase: Phase | null;
  elapsed: number;
  hasResults: boolean;
  beforeGrade: number;
  afterGrade: number;
  entityPct: number;
  onReplayPreview: () => void;
  onScrollToInput: () => void;
}

const LEVEL_SHORT: Record<ReadingLevel, string> = {
  simple: "G5–6",
  everyday: "G7–8",
  clear: "G9–10",
  university: "G11–12"
};

function formatWatchClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec % 1) * 100);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")} ${String(cs).padStart(2, "0")}`;
}

/**
 * Calm, focused Seiko-framed hero.
 * - Left: clear editorial headline + ONE primary action (auto-adapting to online/offline).
 * - Right: pure live Seiko instrument readout reflecting current settings & run state
 *   (zero redundant buttons competing with the input console).
 */
export default function SeikoHeroInstrument({
  health,
  mode,
  level,
  protect,
  running,
  phase,
  elapsed,
  hasResults,
  beforeGrade,
  afterGrade,
  entityPct,
  onReplayPreview,
  onScrollToInput
}: Props) {
  const [tick, setTick] = useState(0);
  const [nowClock, setNowClock] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => {
      setTick((t) => t + 1);
      setNowClock(new Date());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // health is null when the API is unreachable at all — a static deployment
  // with no server behind it. That is the same state for the reader as Ollama
  // being installed but not running: show the recorded preview either way.
  const isOffline = health == null || !health.ollama;
  const hours = String(nowClock.getHours()).padStart(2, "0");
  const mins = String(nowClock.getMinutes()).padStart(2, "0");
  const secs = String(nowClock.getSeconds()).padStart(2, "0");
  const dialAngle = running ? (tick * 36) % 360 : (nowClock.getSeconds() * 6) % 360;

  const lcdMain = running
    ? formatWatchClock(elapsed)
    : hasResults
      ? `${beforeGrade.toFixed(1)} → ${afterGrade.toFixed(1)}`
      : `${hours}:${mins} ${secs}`;

  const lcdSub = running
    ? phase === "write"
      ? "WRITING · QWEN2.5:3B"
      : phase === "swap"
        ? "VRAM SWAP · LOADING 7B"
        : "VERIFYING · QWEN2.5:7B"
    : hasResults
      ? `GRADE SHIFT · ${entityPct}% FACTS KEPT`
      : isOffline
        ? "OFFLINE · RECORDED PREVIEW AVAILABLE"
        : "LOCAL OLLAMA · READY";

  const days = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const todayIdx = nowClock.getDay();

  const shieldCount =
    (protect.scientific ? 1 : 0) + (protect.legal ? 1 : 0) + protect.customTerms.length;

  return (
    <section className="poster-frame" aria-label="Plainly overview">
      <div className="poster-frame__inner">
        <div className="poster-hero__copy">
          <div className="poster-hero__eyebrow">
            <span className="px-sq" aria-hidden="true" />
            <span>LOCAL READING-LEVEL INSTRUMENT</span>
          </div>

          <h1 className="poster-hero__title">
            Read it plainly.
            <br />
            Keep the meaning.
          </h1>

          <p className="poster-hero__lede">
            Rewrite dense text to your reading level, sentence by sentence — with word diffs,
            fact checks, and audio sync running locally on your machine.
          </p>

          <div className="poster-hero__actions">
            {isOffline ? (
              <>
                <button
                  type="button"
                  className="btn-smooth btn-smooth--amber"
                  onClick={onReplayPreview}
                  disabled={running}
                >
                  <span className="px-icon" aria-hidden="true">▸</span>
                  Replay sample run
                </button>
                <button type="button" className="btn-smooth" onClick={onScrollToInput}>
                  Open editor ↓
                </button>
              </>
            ) : (
              <button type="button" className="btn-smooth btn-smooth--primary" onClick={onScrollToInput}>
                Start simplifying ↓
              </button>
            )}
          </div>
          {isOffline && (
            <p className="poster-hero__hint">
              Ollama isn&rsquo;t detected on this machine — preview a recorded 3B→7B run above, or
              start Ollama locally for live text.
            </p>
          )}
        </div>

        {/* Pure Readout Seiko Chronograph Module (calm, informative, no duplicate buttons) */}
        <div className={`seiko-module ${running ? "is-running" : ""}`} aria-hidden="true">
          <div className="seiko-module__screen">
            <div className="seiko-module__top-row">
              <div className="watch-specs">
                <div className="watch-specs__brand">
                  <span>PLAINLY</span>
                  <small>CHRONOGRAPH</small>
                </div>

                <div className="watch-readouts">
                  <div className="watch-tile">
                    <span>LEVEL</span>
                    <strong>{LEVEL_SHORT[level]}</strong>
                  </div>
                  <div className="watch-tile">
                    <span>PASS</span>
                    <strong>{mode === "verified" ? "3B→7B" : "3B"}</strong>
                  </div>
                  <div className="watch-tile">
                    <span>LOCKS</span>
                    <strong>{shieldCount > 0 ? `${shieldCount} ON` : "AUTO"}</strong>
                  </div>
                  <div className="watch-tile">
                    <span>ENGINE</span>
                    <strong>{isOffline ? "DEMO" : "LOCAL"}</strong>
                  </div>
                </div>
              </div>

              <div className="watch-dial">
                <svg viewBox="0 0 100 100" className="watch-dial__svg">
                  <rect
                    x="8"
                    y="8"
                    width="84"
                    height="84"
                    rx="16"
                    fill="none"
                    stroke="rgba(255,255,255,0.24)"
                    strokeWidth="1.2"
                  />
                  <line x1="50" y1="12" x2="50" y2="18" stroke="rgba(255,255,255,0.45)" strokeWidth="1.3" />
                  <line x1="50" y1="82" x2="50" y2="88" stroke="rgba(255,255,255,0.45)" strokeWidth="1.3" />
                  <line x1="12" y1="50" x2="18" y2="50" stroke="rgba(255,255,255,0.45)" strokeWidth="1.3" />
                  <line x1="82" y1="50" x2="88" y2="50" stroke="rgba(255,255,255,0.45)" strokeWidth="1.3" />
                  <g
                    style={{
                      transform: `rotate(${dialAngle}deg)`,
                      transformOrigin: "50px 50px",
                      transition: "transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)"
                    }}
                  >
                    <line x1="50" y1="50" x2="50" y2="23" stroke="#F28C18" strokeWidth="2" strokeLinecap="round" />
                  </g>
                  <circle cx="50" cy="50" r="3.5" fill="#141413" stroke="#F28C18" strokeWidth="1.6" />
                </svg>
                <span className="watch-dial__tag">{running ? "ACTIVE" : "STANDBY"}</span>
              </div>
            </div>

            <div className="watch-lcd">
              <div className="watch-lcd__days">
                {days.map((d, idx) => (
                  <span key={d} className={idx === todayIdx ? "is-today" : ""}>
                    {d}
                  </span>
                ))}
              </div>
              <div className="watch-lcd__main">{lcdMain}</div>
              <div className="watch-lcd__sub">{lcdSub}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
