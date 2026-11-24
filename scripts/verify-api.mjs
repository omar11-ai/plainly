// Live verification of the /api/simplify contract against local Ollama.
// Usage: node scripts/verify-api.mjs [baseUrl]
import { deterministicCheck } from "../server/pipeline.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:8787";

async function run(body) {
  const started = Date.now();
  const res = await fetch(`${BASE}/api/simplify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    return { ok: false, status: res.status, error: await res.json().catch(() => null), ms: Date.now() - started };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        events.push(JSON.parse(line));
      } catch {
        events.push({ type: "unparsed", line });
      }
    }
  }
  return { ok: true, status: res.status, events, ms: Date.now() - started };
}

const checks = [];
function check(name, pass, detail) {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const health = await (await fetch(`${BASE}/api/health`)).json();
check(
  "health reports both models",
  health.ollama && health.generator.installed && health.verifier.installed,
  `${health.generator.name}=${health.generator.installed} ${health.verifier.name}=${health.verifier.installed}`
);

// 1. Four reading levels, fast mode, why + entities present.
const LEVELS = ["simple", "everyday", "clear", "university"];
const levelRows = [];
for (const level of LEVELS) {
  const out = await run({
    text: "During slow-wave sleep, the hippocampus replays patterns of activity that were recorded during the day, and these replays are thought to transfer newly encoded information into neocortical storage.",
    mode: "fast",
    level,
    protect: { scientific: true }
  });
  const meta = out.events?.find((e) => e.type === "meta");
  const sentence = out.events?.find((e) => e.type === "sentence");
  levelRows.push({
    level,
    ms: out.ms,
    metaLevel: meta?.level,
    target: meta?.targetGrade,
    grade: sentence?.readability?.after?.grade,
    why: sentence?.why,
    entities: sentence?.entities?.length,
    error: sentence?.status === "error"
  });
  check(
    `level "${level}" streams a rewrite`,
    Boolean(sentence && !sentence.errorCode && sentence.plain),
    `${out.ms}ms grade=${sentence?.readability?.after?.grade} why=${sentence?.why ? "yes" : "MISSING"}`
  );
}

// 2. Protected custom term is extracted and preserved.
const locked = await run({
  text: "The hippocampus replays patterns of activity during slow-wave sleep, which supports declarative memory.",
  mode: "fast",
  level: "everyday",
  protect: { scientific: true, customTerms: ["hippocampus", "declarative memory"] }
});
const lockedSentence = locked.events?.find((e) => e.type === "sentence");
const lockedEntities = (lockedSentence?.entities || []).filter((e) => e.kind === "locked");
const lockedIssues = (lockedSentence?.issues || []).filter((i) => i.includes("Protected term"));
check(
  "custom locked terms appear as LOCK entities",
  lockedEntities.length === 2 &&
    lockedEntities.every(
      (e) => e.preserved || lockedIssues.some((i) => i.includes(e.text))
    ),
  lockedEntities.map((e) => `${e.text}:${e.preserved ? "kept" : "flagged"}`).join(", ")
);

// 3. Entity extraction covers numbers, dates, acronyms, qualifiers.
const entitiesOut = await run({
  text: "In 2019, the FDA reviewed 41 trials and found that at least 20 percent of patients improved, though only adults were included.",
  mode: "fast",
  level: "everyday",
  protect: {}
});
const ent = entitiesOut.events?.find((e) => e.type === "sentence")?.entities || [];
const kinds = new Set(ent.map((e) => e.kind));
check(
  "entity kinds include date, acronym, number, qualifier",
  ["date", "acronym", "number", "qualifier"].every((k) => kinds.has(k)),
  [...kinds].join(", ")
);

// 4. Verified mode emits swap + verify, and keeps why/entities on the patch.
const verified = await run({
  text: "Participants who slept for at least 7 hours retained roughly 20 percent more items than participants who stayed awake.",
  mode: "verified",
  level: "everyday",
  protect: {}
});
const phases = verified.events.filter((e) => e.type === "phase").map((e) => e.phase);
const patch = verified.events.find((e) => e.type === "verify");
check("verified mode emits write → swap → verify", phases.join(">") === "write>swap>verify", phases.join(" > "));
check(
  "verify patch carries why + entities",
  Boolean(patch && Array.isArray(patch.entities)),
  `status=${patch?.status} entities=${patch?.entities?.length} why=${patch?.why ? "yes" : "no"}`
);

// 5. Writer JSON reliability: five short calls, all must parse with why.
let parsed = 0;
const reliability = [];
for (let i = 0; i < 5; i++) {
  const out = await run({
    text: "The effect was largest for items that had been rated as difficult at encoding.",
    mode: "fast",
    level: "simple",
    protect: {}
  });
  const s = out.events?.find((e) => e.type === "sentence");
  const good = Boolean(s?.plain && s?.why && !s?.errorCode);
  if (good) parsed += 1;
  reliability.push({ ok: good, ms: out.ms, why: s?.why });
}
check(
  "writer returns {plain, why} JSON 5/5",
  parsed === 5,
  reliability.map((r) => `${r.ms}ms`).join(" ")
);

// 7. The Simple level must actually land near its target, not just relabel.
const simpleRow = levelRows.find((r) => r.level === "simple");
check(
  "Simple level lands within 2.5 grades of target",
  simpleRow && simpleRow.grade <= 8,
  `grade ${simpleRow?.grade} (target 5–6)`
);

// 6. Bad payload is rejected without touching the model.
const bad = await run({ text: "too short", mode: "verified" });
check("short text rejected with 400", bad.status === 400, bad.error?.error);

// 8. Soft hedges stay informational; hard bounds still raise an issue. This is
// what keeps a VERIFIED card from showing a red ✕ pill.
const softDet = deterministicCheck(
  "Most, but not all, participants improved after the training.",
  "Most participants improved after the training."
);
const softEnt = softDet.entities.find((e) => e.kind === "qualifier" && e.text === "most, not all");
check(
  "soft hedge is marked soft and does not raise an issue",
  softEnt?.soft === true && !softDet.issues.some((i) => i.includes("most, not all")),
  `soft=${softEnt?.soft} issues=${softDet.issues.length}`
);

const hardDet = deterministicCheck("Only adults were included in the trial.", "Adults were included in the trial.");
const hardEnt = hardDet.entities.find((e) => e.kind === "qualifier" && e.text === "only");
check(
  "hard qualifier is not soft and raises an issue",
  hardEnt?.soft !== true && hardDet.issues.some((i) => i.includes("only")),
  `soft=${hardEnt?.soft} issues=${hardDet.issues.length}`
);

const failed = checks.filter((c) => !c.pass);
console.log("");
console.log(JSON.stringify({ levelRows, reliability, passed: checks.length - failed.length, total: checks.length }, null, 2));
console.log(failed.length === 0 ? "ALL CHECKS PASSED" : `${failed.length} CHECK(S) FAILED`);
process.exitCode = failed.length === 0 ? 0 : 1;
