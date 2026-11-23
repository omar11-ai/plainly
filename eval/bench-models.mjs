// Measures what the pipeline actually costs on this machine:
// one rewrite pass with the writer, one check pass with the checker, and the
// model swap in between.
// Usage: node eval/bench-models.mjs
import { processSentence, verifyRewrite } from "../server/pipeline.mjs";
import { unloadModel } from "../server/ollama.mjs";
import { GENERATOR_MODEL, VERIFIER_MODEL, OLLAMA_URL } from "../server/config.mjs";

const SENTENCES = [
  "The hippocampus replays patterns of activity during slow-wave sleep.",
  "Participants who slept for at least 7 hours retained roughly 20 percent more items than participants who stayed awake.",
  "A 2019 review of 41 experiments concluded that sleep after learning improves retention in most, but not all, tested conditions."
];

async function ps() {
  try {
    const data = await (await fetch(`${OLLAMA_URL}/api/ps`)).json();
    const map = {};
    for (const m of data.models || []) {
      map[m.name] = {
        totalGb: +(m.size / 1024 ** 3).toFixed(2),
        vramGb: +(m.size_vram / 1024 ** 3).toFixed(2),
        gpuShare: Math.round((m.size_vram / m.size) * 100)
      };
    }
    return map;
  } catch {
    return {};
  }
}

const time = async (fn) => {
  const t0 = Date.now();
  const value = await fn();
  return { ms: Date.now() - t0, value };
};

const report = {};

await unloadModel(GENERATOR_MODEL);
await unloadModel(VERIFIER_MODEL);

// Writer: first call includes the load.
const writeRuns = [];
for (const sentence of SENTENCES) {
  writeRuns.push(await time(() => processSentence(sentence, { mode: "fast" })));
}
report.writer = {
  model: GENERATOR_MODEL,
  coldMs: writeRuns[0].ms,
  warmMeanMs: Math.round(writeRuns.slice(1).reduce((s, r) => s + r.ms, 0) / (writeRuns.length - 1)),
  output: writeRuns.map((r) => r.value.plain)
};
report.writerRuntime = await ps();

// Swap: drop the writer, then the first check pays for loading the checker.
await unloadModel(GENERATOR_MODEL);
const checkRuns = [];
for (let i = 0; i < SENTENCES.length; i++) {
  checkRuns.push(
    await time(() => verifyRewrite(SENTENCES[i], writeRuns[i].value.plain))
  );
}
report.checker = {
  model: VERIFIER_MODEL,
  coldMs: checkRuns[0].ms,
  warmMeanMs: Math.round(checkRuns.slice(1).reduce((s, r) => s + r.ms, 0) / (checkRuns.length - 1)),
  verdicts: checkRuns.map((r) => r.value.faithful)
};
report.checkerRuntime = await ps();

report.documentOf8Sentences = {
  writeSeconds: +((report.writer.coldMs + 7 * report.writer.warmMeanMs) / 1000).toFixed(1),
  checkSeconds: +((report.checker.coldMs + 7 * report.checker.warmMeanMs) / 1000).toFixed(1),
  totalSeconds: +(
    (report.writer.coldMs + 7 * report.writer.warmMeanMs + report.checker.coldMs + 7 * report.checker.warmMeanMs) /
    1000
  ).toFixed(1),
  note: "one model load per phase, so the 8th sentence costs the same as the 2nd"
};

console.log(JSON.stringify(report, null, 2));
