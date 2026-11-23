// Runs the faithfulness checker over the hand-built cases.
// Usage: node eval/run-eval.mjs [--json]
import { CASES } from "./cases.mjs";
import { verifyRewrite } from "../server/pipeline.mjs";
import { VERIFIER_MODEL } from "../server/config.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const json = process.argv.includes("--json");
const rows = [];
const startedAt = Date.now();

for (const item of CASES) {
  const t0 = Date.now();
  let verdict;
  try {
    verdict = await verifyRewrite(item.original, item.rewrite);
  } catch (error) {
    verdict = { faithful: null, missing: [], added: [], altered: [], reason: error.message };
  }
  rows.push({
    id: item.id,
    note: item.note,
    expected: item.expected,
    got: verdict.faithful,
    pass: verdict.faithful === item.expected,
    ms: Date.now() - t0,
    detail: [...verdict.missing, ...verdict.added, ...verdict.altered, verdict.reason]
      .filter(Boolean)
      .join(" | ")
  });
  if (!json) {
    const mark = rows.at(-1).pass ? "PASS" : "FAIL";
    console.log(
      `${mark}  ${item.id.padEnd(20)} expected ${String(item.expected).padEnd(5)} got ${String(
        verdict.faithful
      ).padEnd(5)} ${String(Date.now() - t0).padStart(5)}ms  ${item.note}`
    );
    if (!rows.at(-1).pass && rows.at(-1).detail) console.log(`      ${rows.at(-1).detail}`);
  }
}

const passed = rows.filter((r) => r.pass).length;
const faithfulCases = rows.filter((r) => r.expected);
const brokenCases = rows.filter((r) => !r.expected);
const falsePositives = faithfulCases.filter((r) => r.got === false).length;
const falseNegatives = brokenCases.filter((r) => r.got === true).length;
const summary = {
  model: VERIFIER_MODEL,
  cases: rows.length,
  passed,
  accuracy: +(passed / rows.length).toFixed(3),
  falsePositives,
  falseNegatives,
  meanMs: Math.round(rows.reduce((s, r) => s + r.ms, 0) / rows.length),
  totalSeconds: +((Date.now() - startedAt) / 1000).toFixed(1)
};

if (json) {
  console.log(JSON.stringify({ summary, rows }, null, 2));
} else {
  console.log("");
  console.log(
    `${passed}/${rows.length} correct (${(summary.accuracy * 100).toFixed(0)}%) · ${falsePositives} false alarms on good rewrites · ${falseNegatives} missed errors · ${summary.meanMs}ms each`
  );
}

// Keep a copy of the last run so the submission can cite a real result file.
const outDir = join(dirname(fileURLToPath(import.meta.url)), "results");
mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, "latest.json"),
  JSON.stringify({ ranAt: new Date().toISOString(), summary, rows }, null, 2)
);

process.exitCode = passed === rows.length ? 0 : 1;
