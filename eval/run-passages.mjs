// Passage-level evaluation for the rubric's A3 criterion.
// Usage: node eval/run-passages.mjs [baseUrl]
//
// Twelve passages in three difficulty tiers, run through the real pipeline over
// HTTP, measuring what the rubric asks for: Flesch-Kincaid grade before and
// after, sentence fidelity pass rate, latency, and escalation rate.
//
// Passages are synthetic genre fixtures written for this eval: they carry the
// numbers, dates, hedges and names the entity layer has to hold, and no claim
// in them is meant as a statement about the world.

import { readability } from "../server/readability.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] || "http://127.0.0.1:8787";

const PASSAGES = [
  // ---- tier 1: everyday. Notices, leaflets, advice. -----------------------
  {
    id: "e1-benefits",
    tier: "everyday",
    source: "self-written, benefits-notice register",
    text:
      "You must renew your claim by the date printed on your letter, which is at least four weeks before your current award ends. " +
      "If we do not receive your renewal form by that date, your payment will stop and you will have to claim again from the beginning. " +
      "You can ask for the form in large print or braille, but only if you contact us before the deadline."
  },
  {
    id: "e2-medication",
    tier: "everyday",
    source: "self-written, medication-leaflet register",
    text:
      "Take one tablet twice a day, with or after food, and swallow it whole with a glass of water. " +
      "Do not take the double dose to make up for a forgotten one, and do not stop taking it after four weeks unless your doctor tells you to. " +
      "If you develop a rash, swelling, or difficulty breathing, stop taking the tablets and contact a doctor immediately."
  },
  {
    id: "e3-notice",
    tier: "everyday",
    source: "self-written, public-notice register",
    text:
      "The library will close at roughly 5 pm on Fridays from March onward, although the reading room stays open until 7 pm for members. " +
      "Reservations placed more than 48 hours in advance may be collected from the counter, and at most six items can be held at one time. " +
      "If you return an item late on three occasions, your borrowing privileges are suspended for fifteen days."
  },
  {
    id: "e4-advice",
    tier: "everyday",
    source: "self-written, advisory register",
    text:
      "It is best to check the smoke alarm once a week by pressing the test button, because a battery that looks fine can still fail without warning. " +
      "Do not paint over the sensor, and never remove the battery to silence an alarm that is only warning you about burnt toast. " +
      "Replace the whole unit after ten years, even if it appears to work, since the sensor degrades slowly over time."
  },

  // ---- tier 2: clear. Academic prose, one idea per sentence. --------------
  {
    id: "c1-sleep",
    tier: "clear",
    source: "self-written, cognitive-psychology abstract register",
    text:
      "During slow-wave sleep, the hippocampus replays patterns of activity that were recorded during the day, and these replays are thought to transfer newly encoded information into neocortical storage. " +
      "In a frequently cited study, Walker and colleagues found that participants who slept for at least 7 hours after learning a list of word pairs retained roughly 20 percent more items than participants who stayed awake for the same interval. " +
      "The effect was largest for items that had been rated as difficult at encoding, and was absent for items that were learned incidentally."
  },
  {
    id: "c2-adaptation",
    tier: "clear",
    source: "self-written, ecology register",
    text:
      "Plants grown under elevated carbon dioxide concentrations show a roughly 15 percent increase in water-use efficiency, because the stomata remain partially closed while photosynthesis continues. " +
      "The benefit is smaller under nitrogen limitation, which suggests that the response depends on the availability of nutrients rather than on carbon supply alone."
  },
  {
    id: "c3-macroprudential",
    tier: "clear",
    source: "self-written, economics register",
    text:
      "Macroprudential tools such as loan-to-value limits reduce the amplitude of credit cycles, but only when they are tightened before the expansion begins. " +
      "Countercyclical capital buffers of at least 2.5 percent were associated with slower mortgage growth in the years following their introduction, although the effect is confounded with household income growth."
  },
  {
    id: "c4-historic",
    tier: "clear",
    source: "self-written, history register",
    text:
      "The reform reduced the number of administrative districts from roughly 400 to 96, which made central oversight cheaper but weakened local accountability. " +
      "Implementation was uneven: at least two provinces retained their old boundaries until the deadline passed, because local officials resisted the loss of office."
  },

  // ---- tier 3: university. Dense, multi-clause, technical, hedged. --------
  {
    id: "u1-neuro",
    tier: "university",
    source: "self-written, neuroscience register",
    text:
      "Although the replay of waking activity during sharp-wave ripples is widely regarded as a mechanism of consolidation, the extent to which such replay is causally implicated in memory formation remains contested, not least because the same sequences are observed during periods of quiet wakefulness, where they appear to subserve preparatory rather than mnemonic functions. " +
      "Perturbation studies that disrupt ripples typically report impairments at retention intervals of at least twenty-four hours, whereas tests administered immediately after learning are largely unaffected, a dissociation that has been taken to indicate that consolidation unfolds gradually rather than instantaneously."
  },
  {
    id: "u2-econometrics",
    tier: "university",
    source: "self-written, econometrics register",
    text:
      "Because the treatment indicator is plausibly orthogonal to potential outcomes only conditional on the observed covariates, the identifying assumptions underlying the estimator are violated whenever selection is correlated with unobserved determinants of the outcome, a possibility that cannot be excluded by the balance tests reported above and that, if present, would render the estimated coefficient uninformative with respect to the causal parameter of interest."
  },
  {
    id: "u3-contract",
    tier: "university",
    source: "self-written, contract-law register",
    text:
      "The licensee shall not, without the prior written consent of the licensor, sublicense, assign, or otherwise transfer the rights granted hereunder, save that such consent shall not be unreasonably withheld where the transferee undertakes in writing to be bound by the terms of this agreement, provided that no liability shall accrue to the licensor in respect of any act or omission of the transferee occurring prior to the date of the transferee's adherence."
  },
  {
    id: "u4-philosophy",
    tier: "university",
    source: "self-written, philosophy register",
    text:
      "If the normativity of meaning is construed as a set of constraints on what a speaker ought to be understood as having said, rather than as a description of what she in fact said, then the attribution of content must proceed independently of the speaker's own fallible self-ascriptions, which entails that a speaker may be committed to a proposition she explicitly repudiates, and correspondingly may fail to be committed to a proposition she expressly avows."
  }
];

/** Digits, dates, percentages and hedges an entity layer must not lose. */
const countHedges = (text) =>
  (text.match(/\b(at least|at most|only|unless|except|roughly|about|may|might|could)\b/gi) || []).length;

async function runOne(p) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/simplify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: p.text, mode: "verified", level: p.tier, protect: {} })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${p.id}`);

  const events = [];
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (line.trim()) events.push(JSON.parse(line));
    }
  }

  // Latest plain text per sentence index; a re-roll replaces the previous one.
  const plains = new Map();
  const verdicts = new Map();
  for (const e of events) {
    if (e.type === "sentence" && e.index != null) plains.set(e.index, e);
    if (e.type === "verify" && e.index != null) verdicts.set(e.index, e);
  }

  const before = readability(p.text);
  const after = readability([...plains.values()].map((s) => s.plain).filter(Boolean).join(" "));

  let faithful = 0;
  let flagged = 0;
  let errored = 0;
  let unchanged = 0;
  for (const e of plains.values()) {
    // the verify patch supersedes the write-phase sentence event
    const v = verdicts.get(e.index);
    const status = v?.status || e.status;
    if (status === "faithful") faithful += 1;
    else if (status === "unchanged") unchanged += 1;
    else if (status === "error") errored += 1;
    else flagged += 1;
  }

  // the pipeline reports escalation directly: the 7B took a feedback-aware shot
  const escalations = [...verdicts.values()].filter((v) => v.escalated).length;

  const sentences = plains.size;
  const hedgesBefore = countHedges(p.text);
  const plainText = [...plains.values()].map((s) => s.plain).join(" ");
  const hedgesAfter = countHedges(plainText);

  return {
    id: p.id,
    tier: p.tier,
    source: p.source,
    words: before.words,
    sentences,
    gradeBefore: before.grade,
    gradeAfter: after.grade,
    gradeDrop: +(before.grade - after.grade).toFixed(1),
    faithful,
    unchanged,
    flagged,
    errored,
    fidelity: sentences ? +((faithful + unchanged) / sentences).toFixed(3) : 0,
    escalations,
    escalationRate: sentences ? +(escalations / sentences).toFixed(3) : 0,
    hedgesBefore,
    hedgesAfter,
    ms: Date.now() - t0
  };
}

const rows = [];
const startedAt = Date.now();
for (const p of PASSAGES) {
  process.stdout.write(`  running ${p.id} ... `);
  try {
    const row = await runOne(p);
    rows.push(row);
    console.log(
      `FK ${row.gradeBefore} -> ${row.gradeAfter} (${row.gradeDrop > 0 ? "-" : "+"}${Math.abs(row.gradeDrop)}) · ` +
        `${row.faithful + row.unchanged}/${row.sentences} faithful · ${row.escalations} escalations · ${(row.ms / 1000).toFixed(1)}s`
    );
  } catch (error) {
    rows.push({ id: p.id, tier: p.tier, error: error.message });
    console.log(`ERROR ${error.message}`);
  }
}

const ok = rows.filter((r) => !r.error);
const tier = (name) => ok.filter((r) => r.tier === name);
const summary = {
  model: "qwen2.5:3b writer - qwen2.5:7b checker (two-phase, verified mode)",
  ranAt: new Date().toISOString(),
  passages: ok.length,
  failed: rows.length - ok.length,
  byTier: ["everyday", "clear", "university"].map((t) => {
    const set = tier(t);
    return {
      tier: t,
      passages: set.length,
      meanGradeBefore: +(set.reduce((s, r) => s + r.gradeBefore, 0) / set.length).toFixed(1),
      meanGradeAfter: +(set.reduce((s, r) => s + r.gradeAfter, 0) / set.length).toFixed(1),
      fidelity: +(set.reduce((s, r) => s + r.faithful + r.unchanged, 0) / Math.max(1, set.reduce((s, r) => s + r.sentences, 0))).toFixed(3),
      escalations: set.reduce((s, r) => s + r.escalations, 0)
    };
  }),
  overall: {
    meanGradeBefore: +(ok.reduce((s, r) => s + r.gradeBefore, 0) / ok.length).toFixed(1),
    meanGradeAfter: +(ok.reduce((s, r) => s + r.gradeAfter, 0) / ok.length).toFixed(1),
    totalSentences: ok.reduce((s, r) => s + r.sentences, 0),
    totalFaithful: ok.reduce((s, r) => s + r.faithful, 0),
    totalUnchanged: ok.reduce((s, r) => s + r.unchanged, 0),
    totalFlagged: ok.reduce((s, r) => s + r.flagged, 0),
    totalErrored: ok.reduce((s, r) => s + r.errored, 0),
    fidelity: +(ok.reduce((s, r) => s + r.faithful + r.unchanged, 0) / Math.max(1, ok.reduce((s, r) => s + r.sentences, 0))).toFixed(3),
    escalations: ok.reduce((s, r) => s + r.escalations, 0),
    escalationRate: +(
      ok.reduce((s, r) => s + r.escalations, 0) /
      Math.max(1, ok.reduce((s, r) => s + r.sentences, 0))
    ).toFixed(3),
    hedgesBefore: ok.reduce((s, r) => s + r.hedgesBefore, 0),
    hedgesAfter: ok.reduce((s, r) => s + r.hedgesAfter, 0),
    meanLatencyS: +(ok.reduce((s, r) => s + r.ms, 0) / ok.length / 1000).toFixed(1),
    totalSeconds: +((Date.now() - startedAt) / 1000).toFixed(1)
  }
};

console.log("\n" + "=".repeat(64));
console.log(`12-passage eval · ${summary.passages} passages · ${summary.overall.totalSentences} sentences`);
console.log(`  FK grade      ${summary.overall.meanGradeBefore} -> ${summary.overall.meanGradeAfter} (drop ${summary.overall.meanGradeBefore - summary.overall.meanGradeAfter})`);
console.log(`  fidelity      ${summary.overall.fidelity}  (${summary.overall.totalFaithful} faithful + ${summary.overall.totalUnchanged} unchanged / ${summary.overall.totalSentences})`);
console.log(`  flagged       ${summary.overall.totalFlagged} · errored ${summary.overall.totalErrored}`);
console.log(`  escalation    ${summary.overall.escalations} escalations (${summary.overall.escalationRate} of sentences)`);
console.log(`  hedges        ${summary.overall.hedgesBefore} before -> ${summary.overall.hedgesAfter} after`);
console.log(`  latency       ${summary.overall.meanLatencyS}s mean per passage, ${summary.overall.totalSeconds}s total`);
console.log("=".repeat(64));
for (const t of summary.byTier) {
  console.log(
    `  ${t.tier.padEnd(12)} n=${t.passages}  FK ${t.meanGradeBefore} -> ${t.meanGradeAfter}  fidelity ${t.fidelity}  ${t.escalations} escalations`
  );
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), "results");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "passages.json"), JSON.stringify({ summary, rows }, null, 2));
console.log(`\nwrote eval/results/passages.json`);

process.exitCode = rows.some((r) => r.error) ? 1 : 0;