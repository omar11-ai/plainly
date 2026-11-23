import { useState } from "react";
import type { SentenceResult } from "../types";

const LABELS: Record<SentenceResult["status"], string> = {
  checking: "Checking meaning",
  faithful: "Meaning checked",
  flagged: "Needs review",
  unchanged: "Already plain",
  error: "Not processed"
};

export default function SentenceCard({ result }: { result: SentenceResult }) {
  const [speaking, setSpeaking] = useState(false);

  const speak = () => {
    if (!("speechSynthesis" in window)) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(result.plain || result.original);
    utterance.rate = 0.95;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  };

  const gradeBefore = result.readability.before.grade;
  const gradeAfter = result.readability.after.grade;

  return (
    <article className={`sentence sentence--${result.status}`}>
      <header className="sentence__head">
        <span className={`badge badge--${result.status}`}>
          <span className="badge__dot" aria-hidden="true" />
          {LABELS[result.status]}
        </span>
        <span className="sentence__meta">
          {result.status !== "error" && (
            <span className="sentence__grade">
              grade {gradeBefore.toFixed(1)} → {gradeAfter.toFixed(1)}
            </span>
          )}
          {result.escalated && <span className="chip">escalated to {result.model}</span>}
          {result.status === "checking" ? (
            <span className="sentence__ms">checking…</span>
          ) : (
            result.ms != null && <span className="sentence__ms">{(result.ms / 1000).toFixed(1)}s</span>
          )}
        </span>
      </header>

      <div className="sentence__body">
        <div className="sentence__col">
          <p className="sentence__label">Original</p>
          <p className="sentence__text sentence__text--original">{result.original}</p>
        </div>
        <div className="sentence__col sentence__col--plain">
          <p className="sentence__label">
            Plain
            <button
              type="button"
              className="speak"
              onClick={speak}
              aria-label={speaking ? "Stop reading aloud" : "Read the plain version aloud"}
            >
              {speaking ? "◼ Stop" : "▶ Listen"}
            </button>
          </p>
          <p className="sentence__text">
            {result.plain || <span className="sentence__missing">No rewrite was produced.</span>}
          </p>
        </div>
      </div>

      {(result.issues.length > 0 || result.reason) && (
        <footer className="sentence__foot">
          {result.issues.length > 0 && (
            <ul className="issues">
              {result.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
          {result.reason && <p className="sentence__reason">{result.reason}</p>}
        </footer>
      )}
    </article>
  );
}
