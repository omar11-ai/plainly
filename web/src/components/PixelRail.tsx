import { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  running: boolean;
  hasResults: boolean;
  flaggedCount: number;
}

const COLS = 5;
const ROWS = 16;

/**
 * Refined scroll-reactive left pixel rail inspired by the Seiko poster.
 * Uses subtle proportions and gentle easing so the pixel texture feels
 * integrated rather than oversized.
 */
export default function PixelRail({ running, hasResults, flaggedCount }: Props) {
  const [scrollRatio, setScrollRatio] = useState(0);
  const [wavePhase, setWavePhase] = useState(0);
  const [velocity, setVelocity] = useState(0);
  const [blink, setBlink] = useState(false);
  const lastY = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    let decayTimer: number | null = null;

    const onScroll = () => {
      if (rafRef.current != null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        const y = window.scrollY;
        const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        const ratio = Math.max(0, Math.min(1, y / max));
        const delta = Math.abs(y - lastY.current);
        lastY.current = y;

        setScrollRatio(ratio);
        setWavePhase(y * 0.025);
        setVelocity(Math.min(1, delta / 55));

        if (decayTimer) window.clearTimeout(decayTimer);
        decayTimer = window.setTimeout(() => setVelocity(0), 220);
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
      if (decayTimer) window.clearTimeout(decayTimer);
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setWavePhase((p) => p + 0.45);
    }, 180);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setBlink(true);
      window.setTimeout(() => setBlink(false), 140);
    }, 4600);
    return () => window.clearInterval(id);
  }, []);

  const cells = useMemo(() => {
    const list: Array<{ on: boolean; amber: boolean }> = [];
    for (let r = 0; r < ROWS; r++) {
      const progress = r / (ROWS - 1);
      for (let c = 0; c < COLS; c++) {
        const wave = Math.sin(r * 0.55 - wavePhase + c * 0.85) * 0.14;
        const checker = (r + c) % 2 === 0 ? 0.14 : -0.14;
        const threshold = progress * 0.94 + wave + checker + velocity * 0.06;
        const on = threshold > 0.44;

        const bandRow = running
          ? ((wavePhase * 1.3) % ROWS + ROWS) % ROWS
          : scrollRatio * (ROWS - 1);
        const dist = Math.abs(r - bandRow);
        const amber = on && dist < 1.1 && (running || velocity > 0.04 || (r + c) % 3 === 0);

        list.push({ on, amber });
      }
    }
    return list;
  }, [wavePhase, scrollRatio, velocity, running]);

  const faceMood = running
    ? "busy"
    : hasResults && flaggedCount === 0
      ? "happy"
      : flaggedCount > 0
        ? "alert"
        : "idle";

  const starRotation = Math.round(scrollRatio * 135);

  return (
    <aside className="pixel-rail" aria-hidden="true">
      <div className="pixel-rail__inner">
        <div className="pixel-rail__top">
          <svg className="px-glyph" viewBox="0 0 9 9" width="24" height="24">
            <rect x="2" y="0" width="1.5" height="9" />
            <rect x="5.5" y="0" width="1.5" height="9" />
            <rect x="0" y="2" width="9" height="1.5" />
            <rect x="0" y="5.5" width="9" height="1.5" />
          </svg>

          <svg
            className="px-glyph px-glyph--star"
            viewBox="0 0 9 9"
            width="25"
            height="25"
            style={{ transform: `rotate(${starRotation}deg)` }}
          >
            <rect x="4" y="0" width="1" height="3" />
            <rect x="4" y="6" width="1" height="3" />
            <rect x="0" y="4" width="3" height="1" />
            <rect x="6" y="4" width="3" height="1" />
            <rect x="1" y="1" width="1" height="1" />
            <rect x="2" y="2" width="1" height="1" />
            <rect x="7" y="1" width="1" height="1" />
            <rect x="6" y="2" width="1" height="1" />
            <rect x="1" y="7" width="1" height="1" />
            <rect x="2" y="6" width="1" height="1" />
            <rect x="7" y="7" width="1" height="1" />
            <rect x="6" y="6" width="1" height="1" />
          </svg>
        </div>

        <div className="pixel-morse">
          <span
            className="pixel-morse__bar pixel-morse__bar--lg"
            style={{ transform: `scaleY(${0.85 + scrollRatio * 0.35})` }}
          />
          <span className="pixel-morse__bar pixel-morse__bar--md" />
          <span className={`pixel-morse__dot ${scrollRatio > 0.2 ? "is-lit" : ""}`} />
          <span className={`pixel-morse__dot ${scrollRatio > 0.5 ? "is-lit" : ""}`} />
          <span className={`pixel-morse__dot ${scrollRatio > 0.8 ? "is-lit" : ""}`} />
          <span
            className="pixel-morse__block"
            style={{ transform: `translateY(${Math.round(scrollRatio * 10)}px)` }}
          />
        </div>

        <div className="pixel-cascade">
          {cells.map((cell, idx) => (
            <span
              key={idx}
              className={`px-cell ${cell.on ? "is-on" : ""} ${cell.amber ? "is-amber" : ""}`}
            />
          ))}
        </div>

        <div className="pixel-rail__bottom">
          <svg
            className={`px-face px-face--${faceMood}`}
            viewBox="0 0 11 11"
            width="28"
            height="28"
          >
            <rect x="1" y="0" width="9" height="1" />
            <rect x="1" y="10" width="9" height="1" />
            <rect x="0" y="1" width="1" height="9" />
            <rect x="10" y="1" width="1" height="9" />
            {blink ? (
              <>
                <rect x="3" y="4" width="2" height="1" />
                <rect x="6" y="4" width="2" height="1" />
              </>
            ) : (
              <>
                <rect x="3" y="3" width="1.5" height="2" />
                <rect x="6.5" y="3" width="1.5" height="2" />
              </>
            )}
            {faceMood === "busy" ? (
              <rect x="4" y="7" width="3" height="1" className="px-face__accent" />
            ) : faceMood === "alert" ? (
              <>
                <rect x="3" y="7.5" width="5" height="1" className="px-face__accent" />
                <rect x="5" y="6" width="1" height="1" className="px-face__accent" />
              </>
            ) : (
              <>
                <rect x="2.5" y="6.5" width="1" height="1" />
                <rect x="3.5" y="7.5" width="4" height="1" />
                <rect x="7.5" y="6.5" width="1" height="1" />
              </>
            )}
          </svg>

          <svg className="px-hollow" viewBox="0 0 11 11" width="28" height="28">
            <rect x="1" y="0" width="9" height="2" />
            <rect x="1" y="9" width="9" height="2" />
            <rect x="0" y="1" width="2" height="9" />
            <rect x="9" y="1" width="2" height="9" />
          </svg>
        </div>
      </div>
    </aside>
  );
}
