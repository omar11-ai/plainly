import { generateJson, unloadModel } from "./ollama.mjs";
import { readability } from "./readability.mjs";
import { GENERATOR_MODEL, VERIFIER_MODEL } from "./config.mjs";

const ABBREVIATIONS = [
  "Mr",
  "Mrs",
  "Ms",
  "Dr",
  "Prof",
  "St",
  "vs",
  "etc",
  "e.g",
  "i.e",
  "Fig",
  "No",
  "approx",
  "Inc",
  "Ltd",
  "U.S",
  "U.K"
];

const COMMON_CAPITALIZED = new Set([
  "The",
  "This",
  "That",
  "These",
  "Those",
  "A",
  "An",
  "In",
  "On",
  "At",
  "For",
  "From",
  "With",
  "Without",
  "When",
  "While",
  "If",
  "It",
  "Its",
  "We",
  "You",
  "They",
  "He",
  "She",
  "But",
  "And",
  "Or",
  "So",
  "However",
  "Because",
  "Although",
  "There",
  "Their",
  "Our",
  "Your",
  "My",
  "His",
  "Her",
  "As",
  "By",
  "To",
  "Of",
  "Not",
  "No",
  "Some",
  "Many",
  "Most",
  "Each",
  "Every",
  "All",
  "Any",
  "One",
  "Two",
  "Three",
  "First",
  "Second",
  "Third",
  "Finally",
  "Then",
  "Now",
  "Today",
  "Students",
  "People",
  "Researchers",
  "Children",
  "Adults"
]);

const NUMBER_RE = /\b\d[\d,]*(?:\.\d+)?%?\b/g;

function protectAbbreviations(text) {
  let out = text;
  ABBREVIATIONS.forEach((abbr, i) => {
    const pattern = abbr.replace(/\./g, "\\.");
    out = out.replace(new RegExp(`\\b${pattern}\\.`, "g"), `\u00a7${i}\u00a7`);
  });
  return out.replace(/(\d)\.(\d)/g, "$1\u00a7D\u00a7$2");
}

function restoreAbbreviations(text) {
  let out = text;
  ABBREVIATIONS.forEach((abbr, i) => {
    out = out.replace(new RegExp(`\u00a7${i}\u00a7`, "g"), `${abbr}.`);
  });
  return out.replace(/\u00a7D\u00a7/g, ".");
}

export function splitSentences(block) {
  const protectedText = protectAbbreviations(block);
  return protectedText
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"\u201c'(\[])/)
    .map((part) => restoreAbbreviations(part).trim())
    .filter(Boolean);
}

export function splitUnits(text) {
  const blocks = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  const units = [];
  let index = 0;
  for (const block of blocks) {
    const words = block.split(/\s+/).length;
    const looksLikeHeading = words <= 12 && block.length <= 90 && !/[.!?]$/.test(block);
    if (looksLikeHeading) {
      units.push({ index: index++, type: "heading", text: block });
      continue;
    }
    for (const sentence of splitSentences(block)) {
      if (sentence.split(/\s+/).length < 3) continue;
      units.push({ index: index++, type: "sentence", text: sentence });
    }
  }
  return units;
}

export function deterministicCheck(original, plain) {
  const issues = [];

  const originalNumbers = new Set(original.match(NUMBER_RE) || []);
  const plainNumbers = new Set(plain.match(NUMBER_RE) || []);
  for (const number of originalNumbers) {
    if (!plainNumbers.has(number)) issues.push(`Number "${number}" is missing from the rewrite.`);
  }

  const originalNames = new Set(
    (original.match(/\b[A-Z][a-z]{2,}\b/g) || []).filter((w) => !COMMON_CAPITALIZED.has(w))
  );
  const plainLower = plain.toLowerCase();
  for (const name of originalNames) {
    if (!plainLower.includes(name.toLowerCase())) issues.push(`Name or term "${name}" is missing.`);
  }

  const originalWords = original.split(/\s+/).length;
  const plainWords = plain.split(/\s+/).length;
  if (plainWords > originalWords * 1.7 + 3) {
    issues.push("The rewrite is much longer than the original, which can add meaning.");
  }
  if (plainWords < 3) issues.push("The rewrite is too short to keep the original meaning.");

  return { issues };
}

const SIMPLIFY_SYSTEM = `You are a careful plain-language editor. You rewrite one sentence at a time for readers who find dense text hard: people with dyslexia, ADHD, or limited English.

Hard rules:
- Keep every fact, number, date, name, and condition. Never drop a qualifier such as "may", "only", or "up to".
- Never add information, examples, advice, or opinions.
- Keep the same meaning and the same level of certainty.
- Write one clear sentence at a time, around grade 6 to 8 reading level.
- Prefer short common words and an active voice.
- If the sentence is already plain, return it unchanged.

Return JSON only: {"plain": "the rewritten sentence"}`;

async function simplifyOne(sentence, model, keepAlive = "5m") {
  const data = await generateJson({
    model,
    system: SIMPLIFY_SYSTEM,
    prompt: `Rewrite this sentence in plain English.\n\nSENTENCE: ${JSON.stringify(sentence)}`,
    temperature: 0.2,
    numPredict: 260,
    keepAlive
  });
  const plain = typeof data.plain === "string" ? data.plain.trim() : "";
  if (!plain) throw new Error("The model returned an empty rewrite.");
  return { plain, model };
}

const VERIFY_SYSTEM = `You are a strict but fair fact-checker for a plain-language tool. Compare an ORIGINAL sentence with a REWRITE and decide whether a reader would learn exactly the same thing.

A rewrite is faithful when it keeps every fact, number, name, date, condition, comparison, and level of certainty. Plain words, synonyms, and a different sentence shape are fine.

These are NOT errors:
- replacing a hard word with an easier one: "largest" -> "biggest", "encoding" -> "when it was learned"
- swapping a phrase for an equivalent one: "as a substitute for" -> "replace", "prior to" -> "before"
- explaining a technical term in plain words: "retrieval practice" -> "practice at recalling things"
- reordering clauses, or splitting one sentence into two
- dropping words that carry no fact: "items that had been rated" -> "items rated"
- adding a small bridging word that changes nothing: "about", "things", "people"

These ARE errors:
- a different number, name, date, unit, or comparison
- a dropped qualifier: may, might, could, only, just, up to, about, at least, at most, most, some, often, usually, rarely
- stronger or weaker certainty: "is linked to" -> "causes", "can" -> "will"
- a changed scope: "some studies" -> "studies show", "in mice" -> "in people"
- a new claim, example, cause, or piece of advice

Examples:
ORIGINAL: "The authors advise against using the drug in patients with kidney disease."
REWRITE: "The authors say the drug should not be given to people with kidney disease."
Answer: {"faithful": true}

ORIGINAL: "Sleep may help consolidate memory."
REWRITE: "Sleep consolidates memory."
Answer: {"faithful": false, "altered": ["may help -> consolidates"], "reason": "The rewrite states it as certain."}

Reply with JSON only.
If the rewrite keeps the meaning, reply exactly: {"faithful": true}
If it does not, reply: {"faithful": false, "missing": ["fact dropped"], "added": ["claim added"], "altered": ["fact changed"], "reason": "one short sentence"}
Leave out any list that would be empty, and quote the smallest phrase that changed.`;

export async function verifyRewrite(original, plain) {
  const data = await generateJson({
    model: VERIFIER_MODEL,
    system: VERIFY_SYSTEM,
    prompt: `ORIGINAL: ${JSON.stringify(original)}\nREWRITE: ${JSON.stringify(plain)}`,
    temperature: 0,
    numPredict: 140,
    keepAlive: "5m"
  });
  const missing = Array.isArray(data.missing) ? data.missing.filter(Boolean) : [];
  const added = Array.isArray(data.added) ? data.added.filter(Boolean) : [];
  const altered = Array.isArray(data.altered) ? data.altered.filter(Boolean) : [];
  const faithful = data.faithful === true && missing.length === 0 && added.length === 0 && altered.length === 0;
  return {
    faithful,
    missing,
    added,
    altered,
    reason: typeof data.reason === "string" ? data.reason : ""
  };
}

function verdictScore(verdict, det) {
  const penalty =
    det.issues.length * 2 +
    (verdict ? verdict.missing.length + verdict.added.length + verdict.altered.length : 0) +
    (verdict && verdict.faithful ? 0 : 3);
  return -penalty;
}

function finalStatus(faithful, det, plain, original) {
  if (!faithful || det.issues.length > 0) return "flagged";
  return plain.trim() === original.trim() ? "unchanged" : "faithful";
}

function issuesFor(det, verdict) {
  return [
    ...det.issues,
    ...(verdict?.missing || []).map((m) => `Missing: ${m}`),
    ...(verdict?.added || []).map((a) => `Added: ${a}`),
    ...(verdict?.altered || []).map((a) => `Changed: ${a}`)
  ];
}

/**
 * Check one candidate rewrite. When the check fails, the stronger model is
 * already resident, so it gets one shot at a better rewrite and we keep
 * whichever version scores higher.
 */
async function checkCandidate(unit, candidate) {
  const startedAt = Date.now();
  let plain = candidate.plain;
  let model = candidate.model;
  let det = deterministicCheck(unit.text, plain);
  let verdict = await verifyRewrite(unit.text, plain);
  let escalated = false;

  if (!verdict.faithful || det.issues.length > 0) {
    try {
      const retry = await simplifyOne(unit.text, VERIFIER_MODEL, "5m");
      const retryVerdict = await verifyRewrite(unit.text, retry.plain);
      const retryDet = deterministicCheck(unit.text, retry.plain);
      if (verdictScore(retryVerdict, retryDet) > verdictScore(verdict, det)) {
        plain = retry.plain;
        verdict = retryVerdict;
        det = retryDet;
        model = VERIFIER_MODEL;
        escalated = true;
      }
    } catch {
      // Keep the first rewrite when the second pass fails.
    }
  }

  return {
    type: "verify",
    index: unit.index,
    plain,
    status: finalStatus(verdict.faithful, det, plain, unit.text),
    issues: issuesFor(det, verdict),
    reason: verdict.reason,
    model,
    escalated,
    verifyMs: Date.now() - startedAt,
    readability: {
      before: readability(unit.text),
      after: readability(plain)
    }
  };
}

/** One sentence, start to finish. Used by the eval harness. */
export async function processSentence(original, { mode = "verified" } = {}) {
  const unit = { index: 0, type: "sentence", text: original };
  const startedAt = Date.now();
  const candidate = await simplifyOne(original, GENERATOR_MODEL, "5m");

  if (mode !== "verified") {
    const det = deterministicCheck(original, candidate.plain);
    return {
      type: "sentence",
      index: 0,
      original,
      plain: candidate.plain,
      status: finalStatus(det.issues.length === 0, det, candidate.plain, original),
      issues: det.issues,
      reason: "",
      model: candidate.model,
      escalated: false,
      ms: Date.now() - startedAt,
      readability: { before: readability(original), after: readability(candidate.plain) }
    };
  }

  const checked = await checkCandidate(unit, candidate);
  return {
    type: "sentence",
    index: 0,
    original,
    plain: checked.plain,
    status: checked.status,
    issues: checked.issues,
    reason: checked.reason,
    model: checked.model,
    escalated: checked.escalated,
    ms: Date.now() - startedAt,
    readability: checked.readability
  };
}

/**
 * Two phases, one model swap per document.
 *
 * Phase 1 (writer): every sentence gets a rewrite from the small model and
 * streams to the page immediately with status "checking".
 * Phase 2 (checker): the writer is unloaded, the larger model loads once, and
 * every rewrite is verified in reading order.
 *
 * The old version interleaved the two models per sentence, which cost a
 * 12-24s reload on each one on a 6GB card.
 */
export async function processText({ text, mode = "verified", onEvent, shouldStop = () => false }) {
  const units = splitUnits(text);
  const sentences = units.filter((u) => u.type === "sentence");
  const headings = units.filter((u) => u.type === "heading");
  const verifying = mode === "verified" && VERIFIER_MODEL !== GENERATOR_MODEL;

  onEvent({
    type: "meta",
    total: sentences.length,
    headings: headings.length,
    mode: verifying ? "verified" : "fast",
    generator: GENERATOR_MODEL,
    verifier: verifying ? VERIFIER_MODEL : null
  });

  for (const heading of headings) {
    if (shouldStop()) return;
    onEvent({ type: "heading", index: heading.index, text: heading.text });
  }

  const candidates = new Map();
  let cursor = 0;
  let written = 0;

  onEvent({ type: "phase", phase: "write", total: sentences.length });

  async function writer() {
    while (true) {
      if (shouldStop()) return;
      const i = cursor;
      cursor += 1;
      if (i >= sentences.length) return;
      const unit = sentences[i];
      const startedAt = Date.now();
      try {
        const candidate = await simplifyOne(unit.text, GENERATOR_MODEL, verifying ? "5m" : "30m");
        const det = deterministicCheck(unit.text, candidate.plain);
        candidates.set(unit.index, candidate);
        written += 1;
        if (shouldStop()) return;
        onEvent({
          type: "sentence",
          index: unit.index,
          original: unit.text,
          plain: candidate.plain,
          status: verifying
            ? "checking"
            : finalStatus(det.issues.length === 0, det, candidate.plain, unit.text),
          issues: verifying ? [] : det.issues,
          reason: "",
          model: candidate.model,
          escalated: false,
          ms: Date.now() - startedAt,
          readability: { before: readability(unit.text), after: readability(candidate.plain) }
        });
        onEvent({ type: "progress", phase: "write", done: written, total: sentences.length });
      } catch (error) {
        written += 1;
        if (shouldStop()) return;
        onEvent({
          type: "sentence",
          index: unit.index,
          original: unit.text,
          plain: "",
          status: "error",
          issues: [error?.message || "This sentence could not be processed."],
          errorCode: error?.code || "sentence_error",
          readability: { before: readability(unit.text), after: readability(unit.text) }
        });
        onEvent({ type: "progress", phase: "write", done: written, total: sentences.length });
      }
    }
  }

  const workerCount = Math.min(3, sentences.length || 1);
  await Promise.all(Array.from({ length: workerCount }, writer));
  if (shouldStop()) return;

  if (!verifying) {
    onEvent({ type: "done" });
    return;
  }

  onEvent({ type: "phase", phase: "verify", total: sentences.length });
  await unloadModel(GENERATOR_MODEL);
  if (shouldStop()) return;

  let checked = 0;
  for (const unit of sentences) {
    if (shouldStop()) return;
    const candidate = candidates.get(unit.index);
    if (!candidate) continue;
    try {
      const patch = await checkCandidate(unit, candidate);
      if (shouldStop()) return;
      onEvent(patch);
    } catch (error) {
      if (shouldStop()) return;
      onEvent({
        type: "verify",
        index: unit.index,
        status: "flagged",
        issues: [error?.message || "The check could not finish for this sentence."],
        reason: "",
        errorCode: error?.code || "verify_error"
      });
    }
    checked += 1;
    onEvent({ type: "progress", phase: "verify", done: checked, total: sentences.length });
  }

  if (!shouldStop()) onEvent({ type: "done" });
}
