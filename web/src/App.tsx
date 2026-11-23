import { useEffect, useMemo, useRef, useState } from "react";
import InputPanel from "./components/InputPanel";
import SentenceCard from "./components/SentenceCard";
import SummaryBar from "./components/SummaryBar";
import { extractPdf, fetchHealth, streamSimplify } from "./api";
import type { Health, Meta, Phase, SentenceResult, StreamEvent } from "./types";

type Unit =
  | { kind: "heading"; index: number; text: string }
  | { kind: "sentence"; index: number; result: SentenceResult };

export default function App() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"verified" | "fast">("verified");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Record<number, SentenceResult>>({});
  const [headings, setHeadings] = useState<Record<number, string>>({});
  const [meta, setMeta] = useState<Meta | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [filter, setFilter] = useState<"all" | "flagged">("all");
  const [elapsed, setElapsed] = useState(0);
  const [copied, setCopied] = useState(false);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const startedAt = useRef(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    fetchHealth()
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  const stopTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const start = async () => {
    if (running) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setResults({});
    setHeadings({});
    setMeta(null);
    setFatal(null);
    setNotice(null);
    setFilter("all");
    setCopied(false);
    setRunning(true);
    setElapsed(0);
    setPhase(null);
    setProgress(null);
    startedAt.current = Date.now();

    stopTimer();
    timerRef.current = window.setInterval(() => {
      setElapsed((Date.now() - startedAt.current) / 1000);
    }, 200);

    const handle = (event: StreamEvent) => {
      if (event.type === "meta") {
        setMeta({
          total: event.total,
          headings: event.headings,
          mode: event.mode,
          generator: event.generator,
          verifier: event.verifier
        });
      } else if (event.type === "heading") {
        setHeadings((prev) => ({ ...prev, [event.index]: event.text }));
      } else if (event.type === "sentence") {
        setResults((prev) => ({ ...prev, [event.index]: event }));
      } else if (event.type === "verify") {
        setResults((prev) => {
          const current = prev[event.index];
          if (!current) return prev;
          return {
            ...prev,
            [event.index]: {
              ...current,
              plain: event.plain ?? current.plain,
              status: event.status,
              issues: event.issues,
              reason: event.reason ?? current.reason,
              model: event.model ?? current.model,
              escalated: event.escalated ?? current.escalated,
              verifyMs: event.verifyMs,
              readability: event.readability ?? current.readability,
              errorCode: event.errorCode
            }
          };
        });
      } else if (event.type === "phase") {
        setPhase(event.phase);
        setProgress({ done: 0, total: event.total });
      } else if (event.type === "progress") {
        setProgress({ done: event.done, total: event.total });
      } else if (event.type === "fatal") {
        setFatal(event.error);
      }
    };

    try {
      await streamSimplify({ text, mode, signal: controller.signal, onEvent: handle });
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setFatal((error as Error).message || "The simplifier stopped unexpectedly.");
      }
    } finally {
      stopTimer();
      setRunning(false);
      setElapsed((Date.now() - startedAt.current) / 1000);
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    stopTimer();
    setRunning(false);
  };

  const handleFile = async (file: File) => {
    setNotice(null);
    if (file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt")) {
      const content = await file.text();
      setText(content);
      return;
    }
    setNotice("Reading the PDF on this machine…");
    try {
      const { text: extracted, pages } = await extractPdf(file);
      setText(extracted);
      setNotice(`Extracted ${pages} page${pages === 1 ? "" : "s"} of selectable text.`);
    } catch (error) {
      setNotice((error as Error).message);
    }
  };

  const ordered = useMemo(
    () => Object.values(results).sort((a, b) => a.index - b.index),
    [results]
  );

  const units = useMemo<Unit[]>(() => {
    const merged: Unit[] = [
      ...Object.entries(headings).map(([index, heading]) => ({
        kind: "heading" as const,
        index: Number(index),
        text: heading
      })),
      ...ordered.map((result) => ({
        kind: "sentence" as const,
        index: result.index,
        result
      }))
    ];
    return merged.sort((a, b) => a.index - b.index);
  }, [headings, ordered]);

  const stats = useMemo(() => {
    let beforeWeighted = 0;
    let afterWeighted = 0;
    let weight = 0;
    let flagged = 0;
    let checked = 0;
    let pending = 0;
    for (const result of ordered) {
      if (result.status === "error") continue;
      const words = result.readability.before.words;
      beforeWeighted += result.readability.before.grade * words;
      afterWeighted += result.readability.after.grade * words;
      weight += words;
      if (result.status === "checking") pending += 1;
      else checked += 1;
      if (result.status === "flagged") flagged += 1;
    }
    return {
      beforeGrade: weight ? beforeWeighted / weight : 0,
      afterGrade: weight ? afterWeighted / weight : 0,
      checked,
      pending,
      flagged,
      seconds: elapsed,
      words: weight
    };
  }, [ordered, elapsed]);

  const progressPct = useMemo(() => {
    const total = meta?.total ?? 0;
    if (!total) return 0;
    if (phase === "verify") return 50 + Math.min(1, stats.checked / total) * 50;
    const written = stats.checked + stats.pending;
    return Math.min(50, (written / total) * 50);
  }, [phase, meta, stats]);

  const visibleUnits = filter === "flagged" ? units.filter((u) => u.kind === "sentence" && u.result.status === "flagged") : units;

  const copyPlain = async () => {
    const parts = units.map((unit) =>
      unit.kind === "heading" ? `\n${unit.text}\n` : unit.result.plain || unit.result.original
    );
    await navigator.clipboard.writeText(parts.join("\n"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const hasResults = ordered.length > 0;
  const total = meta?.total ?? 0;

  return (
    <div className="page">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Plainly home">
          <span className="brand__mark" aria-hidden="true">
            P
          </span>
          <span className="brand__name">Plainly</span>
        </a>
        <div className="topbar__right">
          <span
            className={`pill ${health?.ollama && health.generator.installed ? "pill--ok" : "pill--warn"}`}
          >
            <span className="pill__dot" aria-hidden="true" />
            {health == null
              ? "checking local model"
              : !health.ollama
                ? "Ollama offline"
                : health.generator.installed
                  ? "local · no cloud"
                  : `pull ${health.generator.name}`}
          </span>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <p className="hero__eyebrow">A plain-language reader that shows its work</p>
          <h1>
            Read it plainly.
            <br />
            Keep the meaning.
          </h1>
          <p className="hero__lede">
            Dense text gets a clear rewrite, sentence by sentence. Each rewrite is checked against the
            original, so you can see what changed and trust what stayed.
          </p>
        </section>

        <InputPanel
          text={text}
          setText={setText}
          mode={mode}
          setMode={setMode}
          running={running}
          onStart={start}
          onStop={stop}
          onFile={handleFile}
          onNotice={setNotice}
        />

        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}

        {fatal && (
          <div className="alert" role="alert">
            <strong>That did not finish.</strong>
            <span>{fatal}</span>
            {hasResults && <span>Your finished sentences are still below.</span>}
          </div>
        )}

        {running && !hasResults && (
          <p className="working" role="status">
            Loading the local model and rewriting the first sentences on this machine…
          </p>
        )}

        {hasResults && (
          <>
            <SummaryBar stats={stats} total={total} progressPct={progressPct} />

            <div className="results__bar">
              <div className="results__title">
                <h2>Sentence by sentence</h2>
                <p>
                  {phase === "verify"
                    ? `${stats.checked} of ${total} checked`
                    : `${stats.checked + stats.pending} of ${total} rewritten`}
                  {meta?.verifier ? ` · ${meta.generator} writes, ${meta.verifier} checks` : " · fast mode"}
                </p>
              </div>
              <div className="results__actions">
                <div className="segmented" role="group" aria-label="Filter results">
                  <button
                    type="button"
                    className={filter === "all" ? "is-active" : ""}
                    onClick={() => setFilter("all")}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className={filter === "flagged" ? "is-active" : ""}
                    onClick={() => setFilter("flagged")}
                  >
                    Needs review ({stats.flagged})
                  </button>
                </div>
                <button type="button" className="button button--small" onClick={copyPlain}>
                  {copied ? "Copied" : "Copy plain text"}
                </button>
              </div>
            </div>

            <section className="results" aria-live="polite">
              {running && (
                <p className="working working--inline" role="status">
                  {phase === "verify"
                    ? `Checking each rewrite against the original with ${meta?.verifier ?? "the verifier"}… ${
                        progress?.done ?? 0
                      } of ${progress?.total ?? total}`
                    : `Rewriting with ${meta?.generator ?? "the local model"}… ${
                        progress?.done ?? 0
                      } of ${progress?.total ?? total}`}
                </p>
              )}
              {visibleUnits.length === 0 && !running && (
                <p className="empty-filter">Nothing needs review in this pass.</p>
              )}
              {visibleUnits.map((unit) =>
                unit.kind === "heading" ? (
                  <h3 key={`h-${unit.index}`} className="section-heading">
                    {unit.text}
                  </h3>
                ) : (
                  <SentenceCard key={`s-${unit.index}`} result={unit.result} />
                )
              )}
            </section>
          </>
        )}

        {!hasResults && !running && (
          <section className="how">
            <h2>How the check works</h2>
            <ol className="how__list">
              <li>
                <span className="how__num">1</span>
                <div>
                  <h3>A small model rewrites</h3>
                  <p>
                    A 3B model turns each sentence into plain language, keeping numbers, names, and
                    qualifiers.
                  </p>
                </div>
              </li>
              <li>
                <span className="how__num">2</span>
                <div>
                  <h3>A stronger model verifies</h3>
                  <p>
                    A 7B model compares the rewrite with the original and lists anything dropped, added,
                    or changed.
                  </p>
                </div>
              </li>
              <li>
                <span className="how__num">3</span>
                <div>
                  <h3>You see the risk</h3>
                  <p>
                    Anything that fails the check is flagged and retried with the stronger model. The
                    original stays beside it.
                  </p>
                </div>
              </li>
            </ol>
            <p className="how__note">
              Everything runs locally through Ollama. Nothing you paste is sent to a cloud service.
            </p>
          </section>
        )}
      </main>

      <footer className="footer">
        <p>Plainly · built for the Global AI Builder&rsquo;s Challenge 2026</p>
        <p>Local models, visible checks, no account.</p>
      </footer>
    </div>
  );
}
