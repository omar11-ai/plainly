import { useRef } from "react";
import { SAMPLE_TEXT } from "../sample";

interface Props {
  text: string;
  setText: (value: string) => void;
  mode: "verified" | "fast";
  setMode: (value: "verified" | "fast") => void;
  running: boolean;
  onStart: () => void;
  onStop: () => void;
  onFile: (file: File) => void;
  onNotice: (message: string | null) => void;
}

export default function InputPanel({
  text,
  setText,
  mode,
  setMode,
  running,
  onStart,
  onStop,
  onFile,
  onNotice
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <section className="composer" aria-labelledby="composer-title">
      <div className="composer__head">
        <div>
          <h2 id="composer-title">Put the dense text here</h2>
          <p className="composer__sub">
            Paste a chapter, a policy, or a paper. Plainly keeps the original beside every rewrite.
          </p>
        </div>
        <div className="composer__tools">
          <button
            type="button"
            className="link"
            onClick={() => {
              setText(SAMPLE_TEXT);
              onNotice(null);
            }}
            disabled={running}
          >
            Try a sample
          </button>
          <button
            type="button"
            className="link"
            onClick={() => fileRef.current?.click()}
            disabled={running}
          >
            Upload PDF
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

      <label className="visually-hidden" htmlFor="source-text">
        Text to simplify
      </label>
      <textarea
        id="source-text"
        className="composer__text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Paste at least a few sentences…"
        spellCheck={false}
        disabled={running}
      />

      <div className="composer__foot">
        <div className="composer__count">
          {words.toLocaleString()} words · {text.length.toLocaleString()} characters
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
            <span className="mode__hint">3B writes, 7B verifies</span>
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
            <span className="mode__hint">3B only, no second check</span>
          </label>
        </fieldset>

        {running ? (
          <button type="button" className="button button--ghost" onClick={onStop}>
            Stop
          </button>
        ) : (
          <button
            type="button"
            className="button button--primary"
            onClick={onStart}
            disabled={words < 5}
          >
            Make it plain
          </button>
        )}
      </div>
    </section>
  );
}
