import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import InputPanel from "./components/InputPanel";
import PixelRail from "./components/PixelRail";
import SeikoHeroInstrument from "./components/SeikoHeroInstrument";
import SentenceCard from "./components/SentenceCard";
import SummaryBar from "./components/SummaryBar";
import { extractPdf, fetchHealth, streamSimplify } from "./api";
import {
  QUICK_SAMPLE_TEXT,
  RECORDED_PREVIEW_HEADING,
  RECORDED_PREVIEW_STEPS
} from "./sample";
import type {
  Health,
  Meta,
  Phase,
  ProtectOptions,
  ReadingLevel,
  SentenceResult,
  StreamEvent
} from "./types";

type Unit =
  | { kind: "heading"; index: number; text: string }
  | { kind: "sentence"; index: number; result: SentenceResult };

const STORAGE_KEY = "plainly:last-session:v2";

interface SavedSession {
  text: string;
  mode: "verified" | "fast";
  level: ReadingLevel;
  protect: ProtectOptions;
  results: Record<number, SentenceResult>;
  headings: Record<number, string>;
  meta: Meta | null;
  elapsed: number;
  isPreview: boolean;
}

/** Delicate inline pixel-art divider to weave the pixel motif into the main body */
function PixelDivider({ label }: { label?: string }) {
  return (
    <div className="px-divider" aria-hidden="true">
      <span className="px-divider__track" />
      {label && <span className="px-divider__label">{label}</span>}
      <span className="px-divider__track px-divider__track--rev" />
    </div>
  );
}

export default function App() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"verified" | "fast">("verified");
  const [level, setLevel] = useState<ReadingLevel>("everyday");
  const [protect, setProtect] = useState<ProtectOptions>({
    scientific: true,
    legal: false,
    customTerms: []
  });

  const [running, setRunning] = useState(false);
  const [isPreview, setIsPreview] = useState(false);
  const [results, setResults] = useState<Record<number, SentenceResult>>({});
  const [headings, setHeadings] = useState<Record<number, string>>({});
  const [meta, setMeta] = useState<Meta | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; pages: number } | null>(null);

  // Results toolbar state
  const [filter, setFilter] = useState<"all" | "flagged">("all");
  const [showDiff, setShowDiff] = useState(true);
  const [viewMode, setViewMode] = useState<"split" | "plain">("split");
  const [fontScale, setFontScale] = useState<0 | 1 | 2>(0);
  const [wideSpacing, setWideSpacing] = useState(false);
  const [keepOriginals, setKeepOriginals] = useState<Record<number, boolean>>({});
  const [exportOpen, setExportOpen] = useState(false);

  // Progress & timing
  const [elapsed, setElapsed] = useState(0);
  const [copiedMode, setCopiedMode] = useState<"plain" | "md" | null>(null);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const [scrolled, setScrolled] = useState(false);

  // Centralized synchronized audio state
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [spokenCharIndex, setSpokenCharIndex] = useState<number>(-1);
  const [readingAll, setReadingAll] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const previewTimersRef = useRef<number[]>([]);
  const startedAt = useRef(0);
  const timerRef = useRef<number | null>(null);
  const speechQueueRef = useRef<Array<{ index: number; text: string }>>([]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as SavedSession;
      if (saved.text) setText(saved.text);
      if (saved.mode) setMode(saved.mode);
      if (saved.level) setLevel(saved.level);
      if (saved.protect) setProtect(saved.protect);
      if (saved.results && Object.keys(saved.results).length > 0) {
        setResults(saved.results);
        setHeadings(saved.headings || {});
        setMeta(saved.meta || null);
        setElapsed(saved.elapsed || 0);
        setIsPreview(Boolean(saved.isPreview));
      }
    } catch {
      // Ignore corrupt storage
    }
  }, []);

  useEffect(() => {
    if (running) return;
    if (Object.keys(results).length === 0) return;
    try {
      const payload: SavedSession = {
        text,
        mode,
        level,
        protect,
        results,
        headings,
        meta,
        elapsed,
        isPreview
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore quota errors
    }
  }, [running, results, headings, meta, elapsed, text, mode, level, protect, isPreview]);

  useEffect(() => {
    fetchHealth()
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  const stopSpeech = useCallback(() => {
    speechQueueRef.current = [];
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeakingIndex(null);
    setSpokenCharIndex(-1);
    setReadingAll(false);
  }, []);

  const clearPreviewTimers = useCallback(() => {
    previewTimersRef.current.forEach((id) => window.clearTimeout(id));
    previewTimersRef.current = [];
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      clearPreviewTimers();
      stopTimer();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, [clearPreviewTimers, stopTimer]);

  const applyEvent = useCallback((event: StreamEvent) => {
    if (event.type === "meta") {
      setMeta({
        total: event.total,
        headings: event.headings,
        mode: event.mode,
        level: event.level,
        targetGrade: event.targetGrade,
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
            why: event.why ?? current.why,
            status: event.status,
            issues: event.issues,
            entities: event.entities ?? current.entities,
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
  }, []);

  const resetRunState = () => {
    stopSpeech();
    clearPreviewTimers();
    setExportOpen(false);
    setResults({});
    setHeadings({});
    setMeta(null);
    setFatal(null);
    setNotice(null);
    setFilter("all");
    setCopiedMode(null);
    setKeepOriginals({});
    setRunning(true);
    setElapsed(0);
    setPhase(null);
    setProgress(null);
    startedAt.current = Date.now();
    stopTimer();
    timerRef.current = window.setInterval(() => {
      setElapsed((Date.now() - startedAt.current) / 1000);
    }, 100);
  };

  const scrollToInput = () => {
    document.getElementById("input-console")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scrollToResults = () => {
    window.setTimeout(() => {
      document.getElementById("telemetry-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 180);
  };

  const start = async (overrideText?: string) => {
    if (running) return;
    const sourceText = overrideText ?? text;
    if (!sourceText.trim()) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsPreview(false);
    resetRunState();
    if (overrideText) {
      setNotice("Running single-paragraph chunk.");
    }

    try {
      await streamSimplify({
        text: sourceText,
        mode,
        level,
        protect,
        signal: controller.signal,
        onEvent: applyEvent
      });
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

  const startRecordedPreview = () => {
    if (running) return;
    abortRef.current?.abort();
    setText(QUICK_SAMPLE_TEXT);
    setIsPreview(true);
    resetRunState();
    scrollToResults();

    const schedule = (ms: number, fn: () => void) => {
      const id = window.setTimeout(fn, ms);
      previewTimersRef.current.push(id);
    };

    const totalCount = RECORDED_PREVIEW_STEPS.length;

    schedule(120, () => {
      applyEvent({
        type: "meta",
        total: totalCount,
        headings: 1,
        mode: "verified",
        level: "everyday",
        targetGrade: "7–8",
        generator: "qwen2.5:3b",
        verifier: "qwen2.5:7b"
      });
      applyEvent({ type: "heading", index: 0, text: RECORDED_PREVIEW_HEADING });
      applyEvent({ type: "phase", phase: "write", total: totalCount });
    });

    RECORDED_PREVIEW_STEPS.forEach((step, idx) => {
      schedule(650 + idx * 720, () => {
        applyEvent({ type: "sentence", ...step.draft });
        applyEvent({ type: "progress", phase: "write", done: idx + 1, total: totalCount });
      });
    });

    const swapAt = 650 + totalCount * 720 + 400;
    schedule(swapAt, () => {
      applyEvent({ type: "phase", phase: "swap", total: totalCount });
    });

    const verifyStart = swapAt + 950;
    schedule(verifyStart, () => {
      applyEvent({ type: "phase", phase: "verify", total: totalCount });
    });

    RECORDED_PREVIEW_STEPS.forEach((step, idx) => {
      schedule(verifyStart + 550 + idx * 900, () => {
        applyEvent(step.verify);
        applyEvent({ type: "progress", phase: "verify", done: idx + 1, total: totalCount });
      });
    });

    const endAt = verifyStart + 550 + totalCount * 900 + 250;
    schedule(endAt, () => {
      applyEvent({ type: "done" });
      stopTimer();
      setRunning(false);
      setElapsed((Date.now() - startedAt.current) / 1000);
    });
  };

  const stop = () => {
    abortRef.current?.abort();
    clearPreviewTimers();
    stopTimer();
    setRunning(false);
  };

  const clearSession = () => {
    stop();
    stopSpeech();
    setExportOpen(false);
    setResults({});
    setHeadings({});
    setMeta(null);
    setFatal(null);
    setNotice(null);
    setIsPreview(false);
    setKeepOriginals({});
    localStorage.removeItem(STORAGE_KEY);
  };

  const handleFile = async (file: File) => {
    setNotice(null);
    if (file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt")) {
      const content = await file.text();
      setText(content);
      setUploadedFile({ name: file.name, pages: 1 });
      return;
    }
    setNotice("Extracting selectable text from PDF on this machine…");
    try {
      const { text: extracted, pages } = await extractPdf(file);
      setText(extracted);
      setUploadedFile({ name: file.name, pages });
      setNotice(`Extracted ${pages} page${pages === 1 ? "" : "s"} from ${file.name}.`);
    } catch (error) {
      setUploadedFile(null);
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
    let entitiesTotal = 0;
    let entitiesPreserved = 0;

    for (const result of ordered) {
      if (result.status === "error") continue;
      const words = result.readability.before.words;
      beforeWeighted += result.readability.before.grade * words;
      const activeAfterGrade = keepOriginals[result.index]
        ? result.readability.before.grade
        : result.readability.after.grade;
      afterWeighted += activeAfterGrade * words;
      weight += words;

      if (result.status === "checking") pending += 1;
      else checked += 1;
      if (result.status === "flagged" && !keepOriginals[result.index]) flagged += 1;

      for (const ent of result.entities || []) {
        entitiesTotal += 1;
        if (ent.preserved || keepOriginals[result.index]) entitiesPreserved += 1;
      }
    }
    return {
      beforeGrade: weight ? beforeWeighted / weight : 0,
      afterGrade: weight ? afterWeighted / weight : 0,
      checked,
      pending,
      flagged,
      seconds: elapsed,
      words: weight,
      entitiesTotal,
      entitiesPreserved
    };
  }, [ordered, elapsed, keepOriginals]);

  const entityPct =
    stats.entitiesTotal > 0 ? Math.round((stats.entitiesPreserved / stats.entitiesTotal) * 100) : 100;

  const progressPct = useMemo(() => {
    const total = meta?.total ?? 0;
    if (!total) return 0;
    if (meta?.mode === "fast") {
      return Math.min(100, (stats.checked / total) * 100);
    }
    if (!running && stats.checked >= total) return 100;
    if (phase === "swap") return 50;
    if (phase === "verify") return 50 + Math.min(1, stats.checked / total) * 50;
    const written = stats.checked + stats.pending;
    return Math.min(48, (written / total) * 48);
  }, [phase, meta, stats, running]);

  const visibleUnits =
    filter === "flagged"
      ? units.filter((u) => u.kind === "sentence" && u.result.status === "flagged" && !keepOriginals[u.index])
      : units;

  const speakQueueItem = useCallback((queue: Array<{ index: number; text: string }>, isAll: boolean) => {
    if (!("speechSynthesis" in window) || queue.length === 0) {
      setSpeakingIndex(null);
      setSpokenCharIndex(-1);
      setReadingAll(false);
      return;
    }

    const [head, ...rest] = queue;
    speechQueueRef.current = rest;
    setSpeakingIndex(head.index);
    setSpokenCharIndex(0);
    setReadingAll(isAll);

    const utterance = new SpeechSynthesisUtterance(head.text);
    utterance.rate = 0.94;
    utterance.onboundary = (event) => {
      if (typeof event.charIndex === "number") {
        setSpokenCharIndex(event.charIndex);
      }
    };
    utterance.onend = () => {
      if (speechQueueRef.current.length > 0) {
        speakQueueItem(speechQueueRef.current, isAll);
      } else {
        setSpeakingIndex(null);
        setSpokenCharIndex(-1);
        setReadingAll(false);
      }
    };
    utterance.onerror = () => {
      setSpeakingIndex(null);
      setSpokenCharIndex(-1);
      setReadingAll(false);
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, []);

  const handleSpeakSentence = (result: SentenceResult) => {
    if (speakingIndex === result.index && !readingAll) {
      stopSpeech();
      return;
    }
    const spokenText = keepOriginals[result.index]
      ? result.original
      : result.plain || result.original;
    speakQueueItem([{ index: result.index, text: spokenText }], false);
  };

  const handleListenAll = () => {
    if (readingAll) {
      stopSpeech();
      return;
    }
    const queue = visibleUnits
      .filter((u): u is Extract<Unit, { kind: "sentence" }> => u.kind === "sentence")
      .map((u) => ({
        index: u.index,
        text: keepOriginals[u.index] ? u.result.original : u.result.plain || u.result.original
      }));
    speakQueueItem(queue, true);
  };

  const copyPlain = async () => {
    const parts = units.map((unit) => {
      if (unit.kind === "heading") return `\n${unit.text}\n`;
      return keepOriginals[unit.index]
        ? unit.result.original
        : unit.result.plain || unit.result.original;
    });
    await navigator.clipboard.writeText(parts.join("\n").trim());
    setCopiedMode("plain");
    setExportOpen(false);
    window.setTimeout(() => setCopiedMode(null), 1800);
  };

  const copyMarkdown = async () => {
    const lines = [
      `# Plainly — Verified Plain-Language Report`,
      ``,
      `- **Reading grade:** ${stats.beforeGrade.toFixed(1)} → ${stats.afterGrade.toFixed(1)}`,
      `- **Facts & numbers preserved:** ${entityPct}% (${stats.entitiesPreserved}/${stats.entitiesTotal})`,
      `- **Sentences audited:** ${stats.checked}/${meta?.total ?? ordered.length}`,
      ``,
      `| # | Status | Original | Plain |`,
      `|---|---|---|---|`
    ];
    let n = 1;
    for (const unit of units) {
      if (unit.kind === "heading") continue;
      const plain = keepOriginals[unit.index]
        ? unit.result.original
        : unit.result.plain || unit.result.original;
      const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
      lines.push(
        `| ${n++} | ${keepOriginals[unit.index] ? "kept-original" : unit.result.status} | ${esc(
          unit.result.original
        )} | ${esc(plain)} |`
      );
    }
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopiedMode("md");
    setExportOpen(false);
    window.setTimeout(() => setCopiedMode(null), 1800);
  };

  const exportPdf = () => {
    setExportOpen(false);
    window.print();
  };

  const hasResults = ordered.length > 0;
  const total = meta?.total ?? 0;

  // Non-cliché Seiko-palette status indicator (Amber = live, Slate-stone = offline/standby)
  const healthStatus = useMemo(() => {
    if (health == null) return { state: "standby" as const, text: "CHECKING LOCAL…" };
    if (!health.ollama) return { state: "standby" as const, text: "DEMO · OLLAMA OFF" };
    if (!health.generator.installed) {
      return { state: "standby" as const, text: `PULL ${health.generator.name}` };
    }
    if (mode === "verified" && !health.verifier.installed) {
      return { state: "standby" as const, text: `PULL ${health.verifier.name}` };
    }
    return { state: "live" as const, text: "LOCAL READY" };
  }, [health, mode]);

  let sentenceCounter = 0;

  return (
    <div className={`page font-scale-${fontScale} ${wideSpacing ? "wide-spacing" : ""}`}>
      <header className={`topbar ${scrolled ? "is-scrolled" : ""}`}>
        <a className="brand" href="#top" aria-label="Plainly home">
          <span className="brand__word">
            PLAINLY<span className="brand__pixel">=]</span>
          </span>
          <span className="brand__tag">VERIFIED READER</span>
        </a>

        <div className="topbar__right">
          <span className={`seiko-pill seiko-pill--${healthStatus.state}`}>
            <span className="seiko-pill__sq" aria-hidden="true" />
            {healthStatus.text}
          </span>
        </div>
      </header>

      <div className="poster-shell" id="top">
        <PixelRail running={running} hasResults={hasResults} flaggedCount={stats.flagged} />

        <main className="poster-main">
          {/* 1. Smooth Rounded Hero Poster Frame */}
          <SeikoHeroInstrument
            health={health}
            mode={mode}
            level={level}
            protect={protect}
            running={running}
            phase={phase}
            elapsed={elapsed}
            hasResults={hasResults}
            beforeGrade={stats.beforeGrade}
            afterGrade={stats.afterGrade}
            entityPct={entityPct}
            onReplayPreview={startRecordedPreview}
            onScrollToInput={scrollToInput}
          />

          {/* 2. Refined Poster Wordmark directly beneath the frame */}
          <section className="wordmark-band" aria-label="Plainly wordmark">
            <div className="wordmark-band__row">
              <div className="wordmark-band__pixel">PLAINLY=]</div>
              <div className="wordmark-band__sub">
                <span>プレインリー</span>
                <span className="wordmark-band__sep">·</span>
                <span>VERIFIED PLAIN-LANGUAGE INSTRUMENT</span>
              </div>
            </div>
            <p className="wordmark-band__spec">
              SENTENCE-BY-SENTENCE SIMPLIFICATION WITH DETERMINISTIC FACT LOCKING AND 7B MEANING
              VERIFICATION. RUNS LOCALLY VIA OLLAMA WITH ZERO CLOUD DEPENDENCY.
            </p>
          </section>

          <PixelDivider label="INPUT" />

          {/* 3. Focused Input Console */}
          <InputPanel
            text={text}
            setText={setText}
            mode={mode}
            setMode={setMode}
            level={level}
            setLevel={setLevel}
            protect={protect}
            setProtect={setProtect}
            running={running}
            uploadedFile={uploadedFile}
            onStart={start}
            onStop={stop}
            onFile={handleFile}
            onNotice={setNotice}
          />

          {notice && (
            <p className="notice" role="status">
              <span className="notice__sq" aria-hidden="true" />
              {notice}
            </p>
          )}

          {fatal && (
            <div className="alert" role="alert">
              <span className="warn-sign" aria-hidden="true">
                !
              </span>
              <div className="alert__body">
                <strong>Could not reach local model</strong>
                <span>{fatal}</span>
                {hasResults && <span>Your finished sentences are still kept below.</span>}
              </div>
            </div>
          )}

          {running && !hasResults && (
            <div className="boot-banner" role="status">
              <span className="boot-banner__sq" aria-hidden="true" />
              <span>Loading local model and streaming the first sentence…</span>
            </div>
          )}

          {hasResults && (
            <div id="telemetry-section">
              <PixelDivider label="OUTPUT" />

              <SummaryBar
                stats={stats}
                total={total}
                progressPct={progressPct}
                phase={phase}
                progress={progress}
                meta={meta}
                running={running}
                isPreview={isPreview}
              />

              {/* Calm, Streamlined Results Bar */}
              <div className="results-bar">
                <div className="results-bar__left">
                  <div className="segmented" role="group" aria-label="Filter sentences">
                    <button
                      type="button"
                      className={filter === "all" ? "is-active" : ""}
                      onClick={() => setFilter("all")}
                    >
                      All ({ordered.length})
                    </button>
                    <button
                      type="button"
                      className={filter === "flagged" ? "is-active" : ""}
                      onClick={() => setFilter("flagged")}
                    >
                      Review ({stats.flagged})
                    </button>
                  </div>

                  <button
                    type="button"
                    className={`tool-toggle ${showDiff ? "is-on" : ""}`}
                    onClick={() => setShowDiff((v) => !v)}
                    aria-pressed={showDiff}
                  >
                    <span className="tool-toggle__sq" aria-hidden="true" />
                    Diff
                  </button>

                  <button
                    type="button"
                    className={`tool-toggle ${viewMode === "plain" ? "is-on" : ""}`}
                    onClick={() => setViewMode((v) => (v === "split" ? "plain" : "split"))}
                    aria-pressed={viewMode === "plain"}
                  >
                    {viewMode === "split" ? "Split view" : "Plain only"}
                  </button>

                  <div className="comfort-group" role="group" aria-label="Reading comfort">
                    <button
                      type="button"
                      className="comfort-btn"
                      onClick={() => setFontScale((s) => (s > 0 ? ((s - 1) as 0 | 1 | 2) : 0))}
                      disabled={fontScale === 0}
                      aria-label="Decrease reading text size"
                    >
                      A−
                    </button>
                    <button
                      type="button"
                      className="comfort-btn"
                      onClick={() => setFontScale((s) => (s < 2 ? ((s + 1) as 0 | 1 | 2) : 2))}
                      disabled={fontScale === 2}
                      aria-label="Increase reading text size"
                    >
                      A+
                    </button>
                    <button
                      type="button"
                      className={`comfort-btn ${wideSpacing ? "is-on" : ""}`}
                      onClick={() => setWideSpacing((v) => !v)}
                      aria-pressed={wideSpacing}
                    >
                      Spacing
                    </button>
                  </div>
                </div>

                <div className="results-bar__right">
                  <button
                    type="button"
                    className={`chip-btn ${readingAll ? "chip-btn--stop" : "chip-btn--amber"}`}
                    onClick={handleListenAll}
                  >
                    {readingAll ? "■ Stop" : "▸ Listen all"}
                  </button>

                  <div className="export-wrap">
                    <button
                      type="button"
                      className="chip-btn"
                      onClick={() => setExportOpen((v) => !v)}
                      aria-expanded={exportOpen}
                    >
                      {copiedMode ? "Copied ✓" : "Export ▾"}
                    </button>
                    {exportOpen && (
                      <div className="export-menu" role="menu">
                        <button type="button" role="menuitem" onClick={copyPlain}>
                          Copy plain text
                        </button>
                        <button type="button" role="menuitem" onClick={copyMarkdown}>
                          Copy Markdown table
                        </button>
                        <button type="button" role="menuitem" onClick={exportPdf}>
                          Export PDF
                        </button>
                        <hr />
                        <button
                          type="button"
                          role="menuitem"
                          className="is-muted"
                          onClick={clearSession}
                        >
                          Clear results
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <section className="results" aria-live="polite">
                {visibleUnits.length === 0 && !running && (
                  <p className="empty-filter">0 sentences need review — everything passed verification.</p>
                )}
                {visibleUnits.map((unit) => {
                  if (unit.kind === "heading") {
                    return (
                      <h3 key={`h-${unit.index}`} className="section-heading">
                        <span className="section-heading__sq" aria-hidden="true" />
                        {unit.text}
                      </h3>
                    );
                  }
                  sentenceCounter += 1;
                  const displayIdx = sentenceCounter;
                  return (
                    <SentenceCard
                      key={`s-${unit.index}`}
                      result={unit.result}
                      displayIndex={displayIdx}
                      showDiff={showDiff}
                      viewMode={viewMode}
                      useOriginal={Boolean(keepOriginals[unit.index])}
                      onToggleOriginal={() =>
                        setKeepOriginals((prev) => ({
                          ...prev,
                          [unit.index]: !prev[unit.index]
                        }))
                      }
                      isSpeaking={speakingIndex === unit.index}
                      spokenCharIndex={speakingIndex === unit.index ? spokenCharIndex : -1}
                      onSpeak={() => handleSpeakSentence(unit.result)}
                    />
                  );
                })}
              </section>
            </div>
          )}

          {!hasResults && !running && (
            <>
              <PixelDivider label="HOW IT WORKS" />
              <section className="how" aria-label="How Plainly works">
                <ol className="how__grid">
                  <li className="how__card">
                    <span className="how__num">01</span>
                    <h3>3B Writer Streams</h3>
                    <p>
                      <code>qwen2.5:3b</code> simplifies sentence by sentence at your chosen reading
                      level while obeying locked jargon terms.
                    </p>
                  </li>
                  <li className="how__card">
                    <span className="how__num">02</span>
                    <h3>Entity &amp; 7B Audit</h3>
                    <p>
                      Deterministic rules lock every number, date, acronym, and qualifier — then{" "}
                      <code>qwen2.5:7b</code> loads once to verify meaning.
                    </p>
                  </li>
                  <li className="how__card">
                    <span className="how__num">03</span>
                    <h3>Escalation &amp; Proof</h3>
                    <p>
                      Any rewrite that weakens a fact or hedge gets retried by 7B with issue
                      feedback, shown alongside the word diff and <em>Why?</em> audit.
                    </p>
                  </li>
                </ol>
              </section>
            </>
          )}
        </main>
      </div>

      <footer className="footer">
        <div className="footer__left">
          <span className="footer__px">PLAINLY=]</span>
          <span>Global AI Builder&rsquo;s Challenge 2026</span>
        </div>
        <div className="footer__right">
          <span>LOCAL OLLAMA · ZERO CLOUD</span>
        </div>
      </footer>
    </div>
  );
}
