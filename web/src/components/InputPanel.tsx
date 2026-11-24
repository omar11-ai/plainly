import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { QUICK_SAMPLE_TEXT, SAMPLE_TEXT } from "../sample";
import type { ProtectOptions, ReadingLevel } from "../types";

interface Props {
  text: string;
  setText: (value: string) => void;
  mode: "verified" | "fast";
  setMode: (value: "verified" | "fast") => void;
  level: ReadingLevel;
  setLevel: (value: ReadingLevel) => void;
  protect: ProtectOptions;
  setProtect: (value: ProtectOptions) => void;
  running: boolean;
  uploadedFile: { name: string; pages: number } | null;
  onStart: (overrideText?: string) => void;
  onStop: () => void;
  onFile: (file: File) => void;
  onNotice: (message: string | null) => void;
}

const LEVELS: Array<{
  id: ReadingLevel;
  label: string;
  grade: string;
}> = [
  { id: "simple", label: "Simple", grade: "G5–6" },
  { id: "everyday", label: "Everyday", grade: "G7–8" },
  { id: "clear", label: "Clear", grade: "G9–10" },
  { id: "university", label: "University", grade: "G11–12" }
];

function extractParagraphs(text: string): Array<{ index: number; preview: string; text: string; sentences: number }> {
  const blocks = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  const paras: Array<{ index: number; preview: string; text: string; sentences: number }> = [];
  let pNum = 1;
  for (const block of blocks) {
    const words = block.split(/\s+/).length;
    const looksLikeHeading = words <= 12 && block.length <= 90 && !/[.!?]$/.test(block);
    if (looksLikeHeading) continue;
    const sentCount = Math.max(1, (block.match(/[.!?]+(?:\s|$)/g) || []).length);
    paras.push({
      index: pNum++,
      preview: block.length > 74 ? `${block.slice(0, 74)}…` : block,
      text: block,
      sentences: sentCount
    });
  }
  return paras;
}

export default function InputPanel({
  text,
  setText,
  mode,
  setMode,
  level,
  setLevel,
  protect,
  setProtect,
  running,
  uploadedFile,
  onStart,
  onStop,
  onFile,
  onNotice
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [termDraft, setTermDraft] = useState("");
  const [showOptions, setShowOptions] = useState(false);

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const paragraphs = useMemo(() => extractParagraphs(text), [text]);
  const levelIndex = Math.max(0, LEVELS.findIndex((l) => l.id === level));

  // The thumb must sit exactly under the active option. Label widths are unequal,
  // so a fixed one-quarter step drifts; measure the real button instead.
  const dialRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState({ x: 4, w: 0 });

  useLayoutEffect(() => {
    const measure = () => {
      const dial = dialRef.current;
      const btn = dial?.querySelectorAll<HTMLButtonElement>(".level-dial__btn")[levelIndex];
      if (!btn) return;
      setThumb({ x: btn.offsetLeft, w: btn.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [levelIndex]);

  const addCustomTerm = (raw: string) => {
    const cleaned = raw.trim().replace(/,$/, "");
    if (cleaned.length < 2) return;
    if (protect.customTerms.some((t) => t.toLowerCase() === cleaned.toLowerCase())) {
      setTermDraft("");
      return;
    }
    setProtect({ ...protect, customTerms: [...protect.customTerms, cleaned] });
    setTermDraft("");
  };

  const removeCustomTerm = (term: string) => {
    setProtect({
      ...protect,
      customTerms: protect.customTerms.filter((t) => t !== term)
    });
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (running) return;
    const file = event.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  const activeSummary = [
    mode === "verified" ? "Checked 3B→7B" : "Fast 3B",
    protect.scientific ? "Scientific kept" : null,
    protect.legal ? "Legal kept" : null,
    protect.customTerms.length > 0 ? `${protect.customTerms.length} locked` : null,
    paragraphs.length >= 2 ? `${paragraphs.length} paragraphs` : null
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section
      id="input-console"
      className={`composer ${dragging ? "is-dragging" : ""}`}
      aria-labelledby="composer-title"
      onDragOver={(e) => {
        e.preventDefault();
        if (!running) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <div className="composer__head">
        <div>
          <span className="spec-kicker">
            <span className="px-sq px-sq--sm" aria-hidden="true" /> STEP 01 · SOURCE TEXT
          </span>
          <h2 id="composer-title">Paste text or drop a PDF</h2>
        </div>

        <div className="composer__tools">
          <button
            type="button"
            className="chip-btn"
            onClick={() => {
              setText(QUICK_SAMPLE_TEXT);
              onNotice("Loaded 3-sentence sample.");
            }}
            disabled={running}
          >
            Short sample
          </button>
          <button
            type="button"
            className="chip-btn"
            onClick={() => {
              setText(SAMPLE_TEXT);
              onNotice(null);
            }}
            disabled={running}
          >
            Full passage
          </button>
          <button
            type="button"
            className="chip-btn"
            onClick={() => fileRef.current?.click()}
            disabled={running}
          >
            ↑ Upload PDF
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,text/plain"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFile(file);
              event.target.value = "";
            }}
          />
        </div>
      </div>

      {uploadedFile && (
        <div className="file-pill">
          <span className="file-pill__tag">PDF</span>
          <span className="file-pill__name">{uploadedFile.name}</span>
          <span className="file-pill__pages">
            {uploadedFile.pages} {uploadedFile.pages === 1 ? "page" : "pages"}
          </span>
        </div>
      )}

      <div className="composer__field-wrap">
        <label className="visually-hidden" htmlFor="source-text">
          Text to simplify
        </label>
        <textarea
          id="source-text"
          className="composer__text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Paste a paragraph, policy, or paper — or drag and drop a PDF file here…"
          spellCheck={false}
          disabled={running}
        />
        {dragging && (
          <div className="drop-overlay">
            <span>DROP PDF OR TXT TO EXTRACT LOCALLY</span>
          </div>
        )}
      </div>

      {/* Primary Control: Reading Level Selector (always clear and focused) */}
      <div className="level-row">
        <div className="level-row__label">
          <span className="spec-kicker">
            <span className="px-sq px-sq--sm" aria-hidden="true" /> STEP 02 · READING LEVEL
          </span>
          <p className="level-row__hint">Choose how simple the output should be.</p>
        </div>

        <div className="level-dial" role="radiogroup" aria-label="Target reading level" ref={dialRef}>
          <div
            className="level-dial__thumb"
            style={{
              left: `${thumb.x}px`,
              width: `${thumb.w}px`
            }}
            aria-hidden="true"
          />
          {LEVELS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={level === item.id}
              className={`level-dial__btn ${level === item.id ? "is-active" : ""}`}
              onClick={() => setLevel(item.id)}
              disabled={running}
            >
              <span className="level-dial__name">{item.label}</span>
              <span className="level-dial__sub">{item.grade}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Collapsible Advanced Drawer: Verification Mode, Jargon Locks & Paragraph Chunks */}
      <div className={`options-drawer ${showOptions ? "is-open" : ""}`}>
        <button
          type="button"
          className="options-drawer__toggle"
          onClick={() => setShowOptions((v) => !v)}
          aria-expanded={showOptions}
        >
          <span className="options-drawer__left">
            <span className="px-sq px-sq--sm" aria-hidden="true" />
            <strong>Options</strong>
            <span className="options-drawer__summary">{activeSummary}</span>
          </span>
          <span className="options-drawer__caret">{showOptions ? "Hide −" : "Customize +"}</span>
        </button>

        {showOptions && (
          <div className="options-drawer__body">
            {/* Verification Mode */}
            <div className="opt-group">
              <div className="opt-group__meta">
                <span className="opt-group__title">Verification pass</span>
                <span className="opt-group__desc">
                  Checked uses a 7B model to verify meaning; Fast uses only 3B.
                </span>
              </div>
              <fieldset className="mode" disabled={running}>
                <legend className="visually-hidden">Checking mode</legend>
                <label className={`mode__option ${mode === "verified" ? "is-active" : ""}`}>
                  <input
                    type="radio"
                    name="mode"
                    value="verified"
                    checked={mode === "verified"}
                    onChange={() => setMode("verified")}
                  />
                  <span className="mode__title">Checked</span>
                  <span className="mode__hint">3B → 7B verify</span>
                </label>
                <label className={`mode__option ${mode === "fast" ? "is-active" : ""}`}>
                  <input
                    type="radio"
                    name="mode"
                    value="fast"
                    checked={mode === "fast"}
                    onChange={() => setMode("fast")}
                  />
                  <span className="mode__title">Fast</span>
                  <span className="mode__hint">3B only</span>
                </label>
              </fieldset>
            </div>

            {/* Jargon Shield */}
            <div className="opt-group">
              <div className="opt-group__meta">
                <span className="opt-group__title">Protected terms</span>
                <span className="opt-group__desc">
                  Keep technical words exact — enforced by the verifier.
                </span>
              </div>
              <div className="jargon-row">
                <button
                  type="button"
                  className={`toggle-key ${protect.scientific ? "is-on" : ""}`}
                  onClick={() => setProtect({ ...protect, scientific: !protect.scientific })}
                  disabled={running}
                  aria-pressed={protect.scientific}
                >
                  <span className="toggle-key__led" aria-hidden="true" />
                  Scientific
                </button>
                <button
                  type="button"
                  className={`toggle-key ${protect.legal ? "is-on" : ""}`}
                  onClick={() => setProtect({ ...protect, legal: !protect.legal })}
                  disabled={running}
                  aria-pressed={protect.legal}
                >
                  <span className="toggle-key__led" aria-hidden="true" />
                  Legal / policy
                </button>
                <div className="lock-input-wrap">
                  <input
                    type="text"
                    className="lock-input"
                    value={termDraft}
                    onChange={(e) => setTermDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        addCustomTerm(termDraft);
                      }
                    }}
                    placeholder="+ Lock word (Enter)"
                    aria-label="Lock a specific word or phrase"
                    disabled={running}
                  />
                  {termDraft.trim().length >= 2 && (
                    <button
                      type="button"
                      className="lock-input__add"
                      onClick={() => addCustomTerm(termDraft)}
                      disabled={running}
                    >
                      Lock
                    </button>
                  )}
                </div>
              </div>
              {protect.customTerms.length > 0 && (
                <div className="locked-chips">
                  {protect.customTerms.map((term) => (
                    <span key={term} className="locked-chip">
                      <span>{term}</span>
                      <button
                        type="button"
                        onClick={() => removeCustomTerm(term)}
                        aria-label={`Unlock ${term}`}
                        disabled={running}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Paragraph-by-Paragraph Chunking */}
            {paragraphs.length >= 2 && (
              <div className="opt-group opt-group--stack">
                <div className="opt-group__meta">
                  <span className="opt-group__title">Run one paragraph at a time</span>
                  <span className="opt-group__desc">
                    Faster turnaround (~20s per paragraph instead of the full text).
                  </span>
                </div>
                <div className="chunk-list">
                  {paragraphs.map((p) => (
                    <div key={p.index} className="chunk-item">
                      <div className="chunk-item__info">
                        <span className="chunk-item__id">¶0{p.index}</span>
                        <span className="chunk-item__preview">{p.preview}</span>
                      </div>
                      <button
                        type="button"
                        className="chip-btn"
                        disabled={running}
                        onClick={() => onStart(p.text)}
                      >
                        Run ¶{p.index} ({p.sentences} sent.)
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="composer__foot">
        <div className="composer__count">
          <span>{words.toLocaleString()} words</span>
          <span className="mono-sep">·</span>
          <span>{text.length.toLocaleString()} chars</span>
        </div>

        {running ? (
          <button type="button" className="btn-hw btn-hw--stop" onClick={onStop}>
            ■ Stop
          </button>
        ) : (
          <button
            type="button"
            className="btn-hw btn-hw--primary"
            onClick={() => onStart()}
            disabled={words < 5}
          >
            Make it plain →
          </button>
        )}
      </div>
    </section>
  );
}
