/**
 * Prove the hosted path is wired, without needing a real API key.
 *
 * The browser installs a provider into globalThis and the SAME server-side
 * pipeline runs. This script installs a fake provider into that same seam and
 * runs `processText` exactly as the app does, so it validates the wiring:
 * provider lookup, model-name live bindings, the events the UI consumes, and
 * that escalation and the entity layer still work through the seam.
 *
 * A fake key means the HTTP call never happens — this is a wiring test, not a
 * test of Google. Run with: node scripts/smoke-cloud.mjs
 */

import { setModelNames, GENERATOR_MODEL, VERIFIER_MODEL } from "../server/config.mjs";

// The seam, as web/src/cloud.ts installs it.
globalThis.__plainly_provider = {
  generateJson: async ({ system, prompt }) => {
    // The writer prompt is recognisable, so reply in the right shape per role.
    if (/strict but fair fact-checker/.test(system || "")) {
      // A faithful verdict for the first sentence, a failing one for the second,
      // so the escalation branch is exercised.
      if (/slow-wave sleep/.test(prompt)) {
        return { faithful: true };
      }
      return {
        faithful: false,
        altered: ["at least 7 hours -> 7 hours"],
        reason: "The rewrite drops the lower bound.",
        missing: [],
        added: []
      };
    }
    // The writer. First pass drops the lower bound (so the check fires and
    // escalation is worth taking); the feedback-aware retry keeps every fact,
    // so the pipeline prefers it — which is the branch worth proving.
    const escalatedRetry = prompt.includes("PREVIOUS DRAFT (failed meaning check)");
    if (escalatedRetry) {
      return {
        plain:
          "Walker and colleagues found that people who slept for at least 7 hours " +
          "after learning retained roughly 20 percent more items.",
        why: "Kept every fact this time."
      };
    }
    return {
      // First draft deliberately drops "at least 7 hours" -> "7 hours".
      plain:
        "Walker and colleagues found that people who slept 7 hours after learning " +
        "retained about 20 percent more items.",
      why: "Split the sentence and used plainer words."
    };
  }
};

setModelNames("gemini-2.5-flash", "gemini-2.5-flash");

if (GENERATOR_MODEL !== "gemini-2.5-flash" || VERIFIER_MODEL !== "gemini-2.5-flash") {
  console.error("FAIL: model names did not follow the live bindings");
  process.exit(1);
}

const { processText } = await import("../server/pipeline.mjs");

const TEXT =
  "During slow-wave sleep, the hippocampus replays patterns of activity that were recorded during the day. " +
  "Walker and colleagues found that participants who slept for at least 7 hours after learning retained roughly 20 percent more items.";

const events = [];
let failure = null;
try {
  await processText({
    text: TEXT,
    mode: "verified",
    level: "everyday",
    protect: { scientific: true, legal: false, customTerms: [] },
    onEvent: (e) => events.push(e)
  });
} catch (error) {
  failure = error;
}

if (failure) {
  console.error("FAIL: the pipeline threw:", failure.message);
  process.exit(1);
}

const kinds = {};
for (const e of events) kinds[e.type] = (kinds[e.type] || 0) + 1;
console.log("events:", JSON.stringify(kinds));

const meta = events.find((e) => e.type === "meta");
const phases = events.filter((e) => e.type === "phase").map((e) => e.phase);
const verify = events.filter((e) => e.type === "verify");
const done = events.find((e) => e.type === "done");

const problems = [];
if (meta?.generator !== "gemini-2.5-flash" || meta?.verifier !== "gemini-2.5-flash") {
  problems.push("meta did not report the hosted model");
}
if (phases.join(",") !== "write,swap,verify") {
  problems.push(`unexpected phases: ${phases.join(",")}`);
}
if (verify.length !== 2) problems.push(`expected 2 verify patches, got ${verify.length}`);
if (!verify.some((v) => v.escalated)) problems.push("escalation never fired through the seam");
if (!done) problems.push("no done event");

// The entity layer is deterministic, so it must still extract through the seam.
const entities = verify.flatMap((v) => v.entities || []).map((e) => e.text);
if (!entities.includes("7")) problems.push(`entity layer lost "7": ${JSON.stringify(entities)}`);
if (!entities.includes("20 percent")) {
  problems.push(`entity layer lost "20 percent": ${JSON.stringify(entities)}`);
}

if (problems.length) {
  console.error("FAIL:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log("PASS: hosted seam drives the real pipeline");
console.log(`  models reported: ${meta.generator} / ${meta.verifier}`);
console.log(`  phases: ${phases.join(" -> ")}`);
console.log(`  escalations: ${verify.filter((v) => v.escalated).length} of ${verify.length}`);
console.log(`  entities extracted: ${entities.join(", ")}`);