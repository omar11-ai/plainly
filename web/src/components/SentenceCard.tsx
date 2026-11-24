import { useEffect, useMemo, useRef, useState } from "react";
import { computeWordDiff } from "../diff";
import type { EntityCheck, SentenceResult } from "../types";

const LABELS: Record<SentenceResult["status"], string> = {
  checking: "CHECKING",
  faithful: "VERIFIED",
  flagged: "NEEDS REVIEW",
  unchanged: "ALREADY PLAIN",
  error: "NOT PROCESSED"
};

const ENTITY_KIND_TAG: Record<EntityCheck["kind"], string> = {
  number: "#",
  date: "DATE",
  acronym: "ACR",
  name: "NAME",
  qualifier: "SCOPE",
  locked: "LOCK"
};

interface Props {
  result: SentenceResult;
  displayIndex: number;
  showDiff: boolean;
  viewMode: "split" | "plain";
  useOriginal: boolean;
  onToggleOriginal: () => void;
  isSpeaking: boolean;
  spokenCharIndex: number;
  onSpeak: () => void;
}

export default function SentenceCard({
  result,
  displayIndex,
  showDiff,
  viewMode,
  useOriginal,
  onToggleOriginal,
  isSpeaking,
  spokenCharIndex,
  onSpeak
}: Props) {
  const [whyOpen, setWhyOpen] = useState(false);
  const [peekOriginal, setPeekOriginal] = useState(false);
  const cardRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (isSpeaking && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isSpeaking]);

  const activePlainText = useOriginal ? result.original : result.plain || result.original;

  const { origTokens, plainTokens } = useMemo(
    () => computeWordDiff(result.original, result.plain || ""),
    [result.original, result.plain]
  );

  const gradeBefore = result.readability.before.grade;
  const gradeAfter = result.readability.after.grade;
  const gradeDrop = gradeBefore - gradeAfter;
  const entities = result.entities || [];

  const isDiffActive =
    showDiff && !useOriginal && result.plain && result.status !== "error" && result.status !== "unchanged";

  const renderPlainContent = () => {
    if (!result.plain && !useOriginal) {
      return <span className="sentence__missing">No rewrite was produced.</span>;
    }

    if (useOriginal) {
      return origTokens.map((tok, i) => {
        const isSpokenWord =
          isSpeaking && !tok.isSpace && spokenCharIndex >= tok.start && spokenCharIndex < tok.end;
        return (
          <span key={i} className={isSpokenWord ? "spoken-word" : undefined}>
            {tok.text}
          </span>
        );
      });
    }

    return plainTokens.map((tok, i) => {
      const isSpokenWord =
        isSpeaking && !tok.isSpace && spokenCharIndex >= tok.start && spokenCharIndex < tok.end;
      const classes = [
        isDiffActive && tok.changed ? "diff-added" : "",
        isSpokenWord ? "spoken-word" : ""
      ]
        .filter(Boolean)
        .join(" ");

      if (!classes) return <span key={i}>{tok.text}</span>;
      return (
        <span key={i} className={classes}>
          {tok.text}
        </span>
      );
    });
  };

  const renderOriginalContent = () => {
    if (!isDiffActive) return result.original;
    return origTokens.map((tok, i) =>
      tok.changed ? (
        <span key={i} className="diff-removed">
          {tok.text}
        </span>
      ) : (
        <span key={i}>{tok.text}</span>
      )
    );
  };

  const statusKey = useOriginal ? "unchanged" : result.status;
  const statusLabel = useOriginal ? "KEPT ORIGINAL" : LABELS[result.status];

  const fallbackWhy =
    result.why ||
    (result.status === "unchanged"
      ? "Already clear at the selected reading level — kept exact."
      : gradeDrop > 0.3
        ? `Reduced reading complexity by ${gradeDrop.toFixed(1)} grade levels while preserving the core facts and qualifiers.`
        : "Rewritten in cleaner, more direct phrasing while keeping the original meaning intact.");

  return (
    <article
      ref={cardRef}
      className={`sentence sentence--${statusKey} ${isSpeaking ? "is-speaking" : ""}`}
    >
      {result.status === "checking" && <div className="scan-line" aria-hidden="true" />}

      <header className="sentence__head">
        <div className="sentence__head-left">
          <span className="sentence__num">#{String(displayIndex).padStart(2, "0")}</span>
          <span className={`badge badge--${statusKey}`}>
            <span className="badge__sq" aria-hidden="true" />
            {statusLabel}
          </span>
          {result.escalated && (
            <span className="chip chip--escalated" title="Retried by the stronger 7B verifier model">
              ↑ 7B REWRITTEN
            </span>
          )}
        </div>

        <div className="sentence__meta">
          {result.status !== "error" && (
            <span className="sentence__grade">
              G{gradeBefore.toFixed(1)} → G{gradeAfter.toFixed(1)}
            </span>
          )}
          {result.status === "checking" ? (
            <span className="sentence__ms">checking…</span>
          ) : (
            result.ms != null && <span className="sentence__ms">{(result.ms / 1000).toFixed(1)}s</span>
          )}

          {result.status !== "error" && (
            <div className="why-wrap">
              <button
                type="button"
                className={`why-btn ${whyOpen ? "is-open" : ""}`}
                onClick={() => setWhyOpen((v) => !v)}
                aria-expanded={whyOpen}
              >
                Why?
              </button>
              {whyOpen && (
                <div className="why-popover" role="dialog" aria-label="Explanation of changes">
                  <div className="why-popover__head">
                    <span>CHANGE AUDIT · #{String(displayIndex).padStart(2, "0")}</span>
                    <button type="button" onClick={() => setWhyOpen(false)} aria-label="Close">
                      ×
                    </button>
                  </div>
                  <p className="why-popover__text">{fallbackWhy}</p>
                  {result.reason && (
                    <p className="why-popover__note">
                      <strong>Verifier note:</strong> {result.reason}
                    </p>
                  )}
                  <div className="why-popover__stats">
                    <span>
                      Words {result.readability.before.words} → {result.readability.after.words}
                    </span>
                    <span>
                      Grade {gradeBefore.toFixed(1)} → {gradeAfter.toFixed(1)}
                    </span>
                    {result.model && <span>{result.model}</span>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <div className={`sentence__body ${viewMode === "plain" && !peekOriginal ? "is-plain-only" : ""}`}>
        {(viewMode === "split" || peekOriginal) && (
          <div className="sentence__col sentence__col--orig">
            <p className="sentence__label">
              <span>ORIGINAL</span>
              {viewMode === "plain" && (
                <button
                  type="button"
                  className="mini-link"
                  onClick={() => setPeekOriginal(false)}
                >
                  Hide
                </button>
              )}
            </p>
            <p className="sentence__text sentence__text--original">{renderOriginalContent()}</p>
          </div>
        )}

        <div className="sentence__col sentence__col--plain">
          <div className="sentence__label">
            <span>{useOriginal ? "ORIGINAL (KEPT)" : "PLAIN"}</span>
            <div className="sentence__col-actions">
              {viewMode === "plain" && !peekOriginal && (
                <button
                  type="button"
                  className="mini-link"
                  onClick={() => setPeekOriginal(true)}
                >
                  Peek original
                </button>
              )}
              {result.status === "flagged" && (
                <button
                  type="button"
                  className={`mini-link ${useOriginal ? "is-active" : ""}`}
                  onClick={onToggleOriginal}
                >
                  {useOriginal ? "Use plain draft" : "Keep original"}
                </button>
              )}
              <button
                type="button"
                className={`speak ${isSpeaking ? "is-playing" : ""}`}
                onClick={onSpeak}
                aria-label={isSpeaking ? "Stop reading aloud" : `Read "${activePlainText.slice(0, 30)}" aloud`}
              >
                {isSpeaking ? (
                  <>
                    <span className="eq-bars" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                    Stop
                  </>
                ) : (
                  "▸ Listen"
                )}
              </button>
            </div>
          </div>
          <p className="sentence__text sentence__text--plain">{renderPlainContent()}</p>
        </div>
      </div>

      {entities.length > 0 && (
        <div className="entity-strip" aria-label="Preserved facts and entities">
          <span className="entity-strip__label">PRESERVED</span>
          <div className="entity-strip__list">
            {entities.map((ent, idx) => {
              const state = ent.preserved ? "ok" : ent.soft ? "soft" : "miss";
              const title = ent.preserved
                ? `${ent.kind} "${ent.text}" verified in rewrite`
                : ent.soft
                  ? `${ent.kind} "${ent.text}" paraphrased — meaning verified`
                  : `${ent.kind} "${ent.text}" missing or altered`;
              return (
                <span key={`${ent.kind}-${ent.text}-${idx}`} className={`entity-pill is-${state}`} title={title}>
                  <span className="entity-pill__kind">{ENTITY_KIND_TAG[ent.kind]}</span>
                  <span className="entity-pill__val">{ent.text}</span>
                  <span className="entity-pill__mark" aria-hidden="true">
                    {ent.preserved ? "✓" : ent.soft ? "~" : "✕"}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {(result.issues.length > 0 || (result.reason && result.status === "flagged")) && (
        <footer className="sentence__foot">
          <div className="warn-sign" aria-hidden="true">
            !
          </div>
          <div className="sentence__foot-body">
            {result.issues.length > 0 && (
              <ul className="issues">
                {result.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}
            {result.reason && <p className="sentence__reason">{result.reason}</p>}
          </div>
        </footer>
      )}
    </article>
  );
}
