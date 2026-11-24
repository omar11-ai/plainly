// Checks fail-fast behavior when Ollama is unreachable or a model is missing.
// Usage: node scripts/offline-check.mjs <baseUrl> <expectedCode> [modelName]
const [base, expectedCode, modelName] = process.argv.slice(2);
if (!base || !expectedCode) {
  console.error("usage: node scripts/offline-check.mjs <baseUrl> <model_offline|model_missing> [modelName]");
  process.exit(2);
}

const res = await fetch(`${base}/api/simplify`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    text: "The hippocampus replays patterns of activity during slow-wave sleep. Participants who slept for at least 7 hours retained more items. The effect was largest for difficult items.",
    mode: "verified",
    level: "everyday",
    protect: {}
  })
});

const text = await res.text();
const events = text
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return { type: "unparsed", line: l };
    }
  });

const fatals = events.filter((e) => e.type === "fatal");
const errorCards = events.filter((e) => e.type === "sentence" && e.status === "error");
const fatal = fatals[0];

const checks = [
  ["one fatal event only", fatals.length === 1],
  [`fatal code is ${expectedCode}`, fatal?.code === expectedCode],
  ["no per-sentence error cards", errorCards.length === 0],
  ["message is human readable", Boolean(fatal?.error && fatal.error.length > 20)]
];
if (modelName) {
  checks.push([`message names the missing model`, Boolean(fatal?.error?.includes(modelName))]);
}

for (const [name, pass] of checks) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
}
console.log(`      fatal: ${fatal?.code} — ${fatal?.error}`);
console.log(`      events: ${events.map((e) => e.type + (e.phase ? `:${e.phase}` : "")).join(" → ")}`);

process.exitCode = checks.every(([, pass]) => pass) ? 0 : 1;
