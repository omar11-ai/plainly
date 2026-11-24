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
  "During",
  "After",
  "Before",
  "Since",
  "Until",
  "Unless",
  "Several",
  "Participants",
  "Students",
  "People",
  "Researchers",
  "Children",
  "Adults",
  "Sleep",
  "Studies",
  "Results",
  "Section",
  "Chapter",
  "Table",
  "Figure"
]);

const MONTHS =
  "(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)";

const DATE_RE = new RegExp(`\\b${MONTHS}\\.?\\s+\\d{1,2}(?:,\\s*\\d{4})?\\b|\\b(?:19|20)\\d{2}\\b`, "g");
const NUMBER_RE = /\b\d[\d,]*(?:\.\d+)?(?:\s*%|\s+percent\b)?/gi;
const ACRONYM_RE = /\b[A-Z]{2,6}\b/g;
const IGNORED_ACRONYMS = new Set(["II", "III", "IV", "VI", "VII", "VIII", "IX", "AM", "PM", "OK"]);

// Hard bounds and exclusives change the meaning when dropped, so they raise an
// issue. Soft hedges are shown as entities but left to the 7B verifier, which
// can accept a faithful paraphrase.
const HARD_QUALIFIERS = new Set(["at least", "at most", "only", "unless", "except"]);

const QUALIFIER_RULES = [
  { match: /\bat least\b/i, label: "at least", ok: /\b(?:at least|or more|minimum of|no less than)\b/i },
  { match: /\bat most\b/i, label: "at most", ok: /\b(?:at most|up to|no more than|maximum of)\b/i },
  { match: /\bup to\b/i, label: "up to", ok: /\b(?:up to|at most|as much as|as many as|no more than)\b/i },
  { match: /\broughly\b/i, label: "roughly", ok: /\b(?:roughly|about|around|approximately|nearly)\b/i },
  { match: /\bapproximately\b/i, label: "approximately", ok: /\b(?:approximately|about|around|roughly|nearly)\b/i },
  { match: /\bonly\b/i, label: "only", ok: /\b(?:only|just|solely|exclusively)\b/i },
  { match: /\bmay\b/i, label: "may", ok: /\b(?:may|might|could|can sometimes|possibly)\b/i },
  { match: /\bmight\b/i, label: "might", ok: /\b(?:might|may|could|possibly)\b/i },
  { match: /\bmost,\s*but not all\b/i, label: "most, not all", ok: /\b(?:most,?\s*but not all|most.*not all|not every|not all)\b/i },
  { match: /\bunless\b/i, label: "unless", ok: /\b(?:unless|except if|only if)\b/i },
  { match: /\bexcept\b/i, label: "except", ok: /\b(?:except|other than|apart from|excluding)\b/i },
  { match: /\brarely\b/i, label: "rarely", ok: /\b(?:rarely|seldom|not often|infrequently)\b/i }
];

export const READING_LEVELS = {
  simple: {
    id: "simple",
    label: "Simple",
    audience: "Child / Early reader",
    targetGrade: "5–6",
    targetMid: 5.5,
    maxWords: 14,
    guidance:
      "Write at a Grade 5 to 6 reading level. Use short sentences of no more than 14 words. Split long sentences in two. Use only common everyday words, and avoid hard terms unless they are protected."
  },
  everyday: {
    id: "everyday",
    label: "Everyday",
    audience: "School student",
    targetGrade: "7–8",
    targetMid: 7.5,
    maxWords: 18,
    guidance:
      "Write at a Grade 7 to 8 reading level. Prefer short common words, direct active voice, and sentences of no more than 18 words."
  },
  clear: {
    id: "clear",
    label: "Clear",
    audience: "General reader",
    targetGrade: "9–10",
    targetMid: 9.5,
    maxWords: 24,
    guidance:
      "Write at a Grade 9 to 10 reading level. Untangle dense phrasing into crisp, modern prose while keeping natural nuance. Keep sentences under 24 words."
  },
  university: {
    id: "university",
    label: "University",
    audience: "Academic / Pro",
    targetGrade: "11–12",
    targetMid: 11.5,
    maxWords: 30,
    guidance:
      "Write at a Grade 11 to 12 reading level. Keep formal tone and precise vocabulary, only untangling overly nested clauses and passive voice. Keep sentences under 30 words."
  }
};

export function normalizeLevel(level) {
  return READING_LEVELS[level] ? level : "everyday";
}

export function normalizeProtect(protect = {}) {
  const customTerms = Array.isArray(protect?.customTerms)
    ? protect.customTerms
        .map((t) => String(t).trim())
        .filter((t) => t.length >= 2)
        .slice(0, 20)
    : [];
  return {
    scientific: Boolean(protect?.scientific),
    legal: Boolean(protect?.legal),
    customTerms
  };
}

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
  let paragraphIndex = 0;

  for (const block of blocks) {
    const words = block.split(/\s+/).length;
    const looksLikeHeading = words <= 12 && block.length <= 90 && !/[.!?]$/.test(block);
    if (looksLikeHeading) {
      units.push({ index: index++, type: "heading", text: block, paragraphIndex });
      continue;
    }
    const pIdx = paragraphIndex++;
    for (const sentence of splitSentences(block)) {
      if (sentence.split(/\s+/).length < 3) continue;
      units.push({ index: index++, type: "sentence", text: sentence, paragraphIndex: pIdx });
    }
  }
  return units;
}

function normalizeNumToken(raw) {
  const isPercent = /%|\bpercent\b/i.test(raw);
  const numeric = raw
    .replace(/,/g, "")
    .replace(/\s*(?:%|\bpercent\b)/i, "")
    .trim();
  return { raw: raw.trim(), numeric, isPercent, key: `${numeric}${isPercent ? "%" : ""}` };
}

function extractMidSentenceNames(sentence) {
  const found = new Set();
  const re = /\b([A-Z][a-z]{2,})\b/g;
  let m;
  while ((m = re.exec(sentence)) !== null) {
    const word = m[1];
    const before = sentence.slice(0, m.index).trimEnd();
    // Ignore sentence-initial capitalization and words directly after terminal punctuation or quotes
    if (!before || /[.!?:"'\u201c(\[]$/.test(before)) continue;
    if (COMMON_CAPITALIZED.has(word)) continue;
    found.add(word);
  }
  return [...found];
}

export function deterministicCheck(original, plain, { customTerms = [] } = {}) {
  const issues = [];
  const entities = [];
  const seenKeys = new Set();
  const plainLower = plain.toLowerCase();

  const addEntity = (text, kind, preserved, soft = false) => {
    const key = text.toLowerCase();
    const existingIdx = entities.findIndex((e) => e.text.toLowerCase() === key);
    if (existingIdx >= 0) {
      if (kind === "locked") {
        entities[existingIdx] = { text, kind: "locked", preserved };
      }
      return;
    }
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    entities.push(soft ? { text, kind, preserved, soft: true } : { text, kind, preserved });
  };

  // 1. Dates & years
  const dateTexts = new Set();
  const origDates = original.match(DATE_RE) || [];
  for (const d of origDates) {
    const clean = d.trim();
    dateTexts.add(clean);
    const preserved = plainLower.includes(clean.toLowerCase());
    addEntity(clean, "date", preserved);
    if (!preserved) issues.push(`Date or year "${clean}" is missing from the rewrite.`);
  }

  // 2. Numbers & percentages (normalized so "20%" matches "20 percent" and "1,000" matches "1000")
  const origNums = (original.match(NUMBER_RE) || []).map(normalizeNumToken);
  const plainNums = (plain.match(NUMBER_RE) || []).map(normalizeNumToken);
  const plainNumKeys = new Set(plainNums.map((n) => n.key));
  const plainBareNums = new Set(plainNums.map((n) => n.numeric));

  for (const num of origNums) {
    // Skip years already tracked as dates
    if (dateTexts.has(num.raw) || [...dateTexts].some((d) => d.includes(num.raw))) continue;
    const preserved = num.isPercent
      ? plainNumKeys.has(num.key)
      : plainNumKeys.has(num.key) || plainBareNums.has(num.numeric);
    addEntity(num.raw, "number", preserved);
    if (!preserved) issues.push(`Number "${num.raw}" is missing from the rewrite.`);
  }

  // 3. Acronyms (FDA, ADHD, WHO, DNA, etc.)
  const origAcronyms = (original.match(ACRONYM_RE) || []).filter((a) => !IGNORED_ACRONYMS.has(a));
  for (const acr of new Set(origAcronyms)) {
    const preserved = new RegExp(`\\b${acr}\\b`).test(plain);
    addEntity(acr, "acronym", preserved);
    if (!preserved) issues.push(`Acronym "${acr}" is missing from the rewrite.`);
  }

  // 4. Mid-sentence proper nouns
  for (const name of extractMidSentenceNames(original)) {
    if (dateTexts.has(name) || [...dateTexts].some((d) => d.includes(name))) continue;
    const preserved = plainLower.includes(name.toLowerCase());
    addEntity(name, "name", preserved);
    if (!preserved) issues.push(`Name or term "${name}" is missing.`);
  }

  // 5. Key qualifiers / hedges
  for (const rule of QUALIFIER_RULES) {
    if (!rule.match.test(original)) continue;
    const preserved = rule.ok.test(plain);
    const soft = !HARD_QUALIFIERS.has(rule.label);
    addEntity(rule.label, "qualifier", preserved, soft);
    // Let the LLM verifier decide edge-case paraphrases for soft hedges, but flag hard bounds/exclusives
    if (!preserved && !soft) {
      issues.push(`Qualifier "${rule.label}" was dropped or weakened.`);
    }
  }

  // 6. User-locked custom terms
  for (const term of customTerms) {
    if (!original.toLowerCase().includes(term.toLowerCase())) continue;
    const preserved = plainLower.includes(term.toLowerCase());
    addEntity(term, "locked", preserved);
    if (!preserved) issues.push(`Protected term "${term}" was altered or dropped.`);
  }

  const originalWords = original.split(/\s+/).length;
  const plainWords = plain.split(/\s+/).length;
  if (plainWords > originalWords * 1.75 + 4) {
    issues.push("The rewrite is much longer than the original, which can add meaning.");
  }
  if (plainWords < 3) issues.push("The rewrite is too short to keep the original meaning.");

  return { issues, entities };
}

function buildSimplifySystem({ level = "everyday", protect = {} } = {}) {
  const profile = READING_LEVELS[normalizeLevel(level)];
  const p = normalizeProtect(protect);
  const protectLines = [];

  if (p.scientific) {
    protectLines.push(
      "- Keep all scientific, medical, and technical terms verbatim (for example: hippocampus, neocortical, declarative memory). You may add a few plain words to clarify them, never replace them."
    );
  }
  if (p.legal) {
    protectLines.push(
      "- Keep all legal, policy, and contractual terms, obligations, exceptions, and timeframes exact (for example: liability, indemnity, written notice)."
    );
  }
  if (p.customTerms.length > 0) {
    protectLines.push(
      `- You MUST keep these exact protected terms unchanged: ${p.customTerms.map((t) => `"${t}"`).join(", ")}.`
    );
  }

  return `You are a careful plain-language editor. You rewrite one sentence at a time for readers who find dense text hard: people with dyslexia, ADHD, or non-native English.

Target level: ${profile.label} (${profile.audience}, Grade ${profile.targetGrade}).
${profile.guidance}

Hard rules:
- Keep every fact, number, date, name, acronym, and condition. Never drop a qualifier such as "may", "only", "at least", "roughly", or "up to".
- Never add information, examples, advice, or opinions.
- Keep the same meaning and the same level of certainty.
- Keep every sentence under ${profile.maxWords} words.
${
  protectLines.length > 0
    ? protectLines.join("\n")
    : '- Keep technical terms that name a specific idea, such as "retrieval practice" or "slow-wave sleep". You may clarify one in plain words, never replace it with a different idea.'
}
- If the sentence is already plain for this target level, return it unchanged.

Return JSON only:
{"plain": "the rewritten sentence", "why": "one short sentence explaining what complex phrasing was simplified while keeping the facts exact"}`;
}

async function simplifyOne(
  sentence,
  model,
  { keepAlive = "5m", level = "everyday", protect = {}, previousDraft = null, feedback = [] } = {}
) {
  const profile = READING_LEVELS[normalizeLevel(level)];
  const system = buildSimplifySystem({ level, protect });
  let prompt = `Rewrite this sentence in plain English.\n\nSENTENCE: ${JSON.stringify(sentence)}\n\nYou may split it into two or three shorter sentences if that makes it clearer. Do not add or remove any facts.`;
  if (previousDraft && feedback.length > 0) {
    prompt +=
      `\n\nPREVIOUS DRAFT (failed meaning check): ${JSON.stringify(previousDraft)}` +
      `\nISSUES TO FIX:\n- ${feedback.join("\n- ")}` +
      `\n\nProduce a corrected plain rewrite that fixes every issue above while keeping the original meaning exact.`;
  }

  const call = async (promptText) => {
    const data = await generateJson({
      model,
      system,
      prompt: promptText,
      temperature: 0.2,
      numPredict: 320,
      keepAlive
    });
    return {
      plain: typeof data.plain === "string" ? data.plain.trim() : "",
      why: typeof data.why === "string" ? data.why.trim() : ""
    };
  };

  let { plain, why } = await call(prompt);
  if (!plain) throw new Error("The model returned an empty rewrite.");

  // The small model often ignores the grade target on dense sentences. Feed it
  // its own draft and let it tighten up to twice, but only keep real gains.
  if (model === GENERATOR_MODEL && !previousDraft) {
    for (let pass = 0; pass < 3; pass++) {
      const grade = readability(plain).grade;
      if (grade <= profile.targetMid + 2) break;
      try {
        const stricter = await call(
          `${prompt}\n\nYOUR PREVIOUS REWRITE: ${JSON.stringify(plain)}\n` +
            `It scored grade ${grade.toFixed(1)}, but the target is grade ${profile.targetGrade}. ` +
            `Rewrite it again as two or three short sentences of no more than ${profile.maxWords} words each. ` +
            `Replace hard words with common ones. Keep every fact, number, name, and qualifier.`
        );
        if (!stricter.plain) break;
        const tighter = readability(stricter.plain).grade;
        if (tighter >= grade - 0.1) break; // no meaningful improvement, stop retrying
        plain = stricter.plain;
        why = stricter.why || why;
      } catch {
        // Keep the best rewrite so far when the tightening pass fails.
        break;
      }
    }
  }

  return { plain, why, model };
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

function isFatalModelError(error) {
  return error?.code === "model_offline" || error?.code === "model_missing";
}

/**
 * Check one candidate rewrite. When the check fails, the stronger model is
 * already resident, so it gets one feedback-aware shot at a better rewrite
 * and we keep whichever version scores higher.
 */
async function checkCandidate(unit, candidate, { level = "everyday", protect = {} } = {}) {
  const startedAt = Date.now();
  const p = normalizeProtect(protect);
  let plain = candidate.plain;
  let why = candidate.why || "";
  let model = candidate.model;
  let det = deterministicCheck(unit.text, plain, { customTerms: p.customTerms });
  let verdict = await verifyRewrite(unit.text, plain);
  let escalated = false;

  if (!verdict.faithful || det.issues.length > 0) {
    const feedback = [...issuesFor(det, verdict)];
    if (verdict.reason) feedback.push(verdict.reason);

    try {
      const retry = await simplifyOne(unit.text, VERIFIER_MODEL, {
        keepAlive: "5m",
        level,
        protect: p,
        previousDraft: plain,
        feedback
      });
      const retryVerdict = await verifyRewrite(unit.text, retry.plain);
      const retryDet = deterministicCheck(unit.text, retry.plain, { customTerms: p.customTerms });
      if (verdictScore(retryVerdict, retryDet) > verdictScore(verdict, det)) {
        plain = retry.plain;
        why = retry.why || why;
        verdict = retryVerdict;
        det = retryDet;
        model = VERIFIER_MODEL;
        escalated = true;
      }
    } catch (error) {
      if (isFatalModelError(error)) throw error;
      // Keep the first rewrite when the second pass fails.
    }
  }

  return {
    type: "verify",
    index: unit.index,
    plain,
    why,
    status: finalStatus(verdict.faithful, det, plain, unit.text),
    issues: issuesFor(det, verdict),
    entities: det.entities,
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
export async function processSentence(original, { mode = "verified", level = "everyday", protect = {} } = {}) {
  const unit = { index: 0, type: "sentence", text: original };
  const startedAt = Date.now();
  const p = normalizeProtect(protect);
  const candidate = await simplifyOne(original, GENERATOR_MODEL, { keepAlive: "5m", level, protect: p });

  if (mode !== "verified") {
    const det = deterministicCheck(original, candidate.plain, { customTerms: p.customTerms });
    return {
      type: "sentence",
      index: 0,
      original,
      plain: candidate.plain,
      why: candidate.why,
      status: finalStatus(det.issues.length === 0, det, candidate.plain, original),
      issues: det.issues,
      entities: det.entities,
      reason: "",
      model: candidate.model,
      escalated: false,
      ms: Date.now() - startedAt,
      readability: { before: readability(original), after: readability(candidate.plain) }
    };
  }

  const checked = await checkCandidate(unit, candidate, { level, protect: p });
  return {
    type: "sentence",
    index: 0,
    original,
    plain: checked.plain,
    why: checked.why,
    status: checked.status,
    issues: checked.issues,
    entities: checked.entities,
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
 * Phase 2 (swap + checker): the writer is unloaded, the larger model loads once,
 * and every rewrite is verified in reading order with feedback-aware escalation.
 */
export async function processText({
  text,
  mode = "verified",
  level = "everyday",
  protect = {},
  onEvent,
  shouldStop = () => false
}) {
  const normalizedLevel = normalizeLevel(level);
  const normalizedProtect = normalizeProtect(protect);
  const units = splitUnits(text);
  const sentences = units.filter((u) => u.type === "sentence");
  const headings = units.filter((u) => u.type === "heading");
  const verifying = mode === "verified" && VERIFIER_MODEL !== GENERATOR_MODEL;

  onEvent({
    type: "meta",
    total: sentences.length,
    headings: headings.length,
    mode: verifying ? "verified" : "fast",
    level: normalizedLevel,
    targetGrade: READING_LEVELS[normalizedLevel].targetGrade,
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
  let fatalError = null;

  onEvent({ type: "phase", phase: "write", total: sentences.length });

  async function writer() {
    while (true) {
      if (shouldStop() || fatalError) return;
      const i = cursor;
      cursor += 1;
      if (i >= sentences.length) return;
      const unit = sentences[i];
      const startedAt = Date.now();
      try {
        const candidate = await simplifyOne(unit.text, GENERATOR_MODEL, {
          keepAlive: verifying ? "5m" : "30m",
          level: normalizedLevel,
          protect: normalizedProtect
        });
        const det = deterministicCheck(unit.text, candidate.plain, {
          customTerms: normalizedProtect.customTerms
        });
        candidates.set(unit.index, candidate);
        written += 1;
        if (shouldStop() || fatalError) return;
        onEvent({
          type: "sentence",
          index: unit.index,
          original: unit.text,
          plain: candidate.plain,
          why: candidate.why,
          status: verifying
            ? "checking"
            : finalStatus(det.issues.length === 0, det, candidate.plain, unit.text),
          issues: verifying ? [] : det.issues,
          entities: det.entities,
          reason: "",
          model: candidate.model,
          escalated: false,
          ms: Date.now() - startedAt,
          readability: { before: readability(unit.text), after: readability(candidate.plain) }
        });
        onEvent({ type: "progress", phase: "write", done: written, total: sentences.length });
      } catch (error) {
        if (isFatalModelError(error)) {
          fatalError = error;
          return;
        }
        written += 1;
        if (shouldStop() || fatalError) return;
        onEvent({
          type: "sentence",
          index: unit.index,
          original: unit.text,
          plain: "",
          why: "",
          status: "error",
          issues: [error?.message || "This sentence could not be processed."],
          entities: [],
          errorCode: error?.code || "sentence_error",
          readability: { before: readability(unit.text), after: readability(unit.text) }
        });
        onEvent({ type: "progress", phase: "write", done: written, total: sentences.length });
      }
    }
  }

  const workerCount = Math.min(3, sentences.length || 1);
  await Promise.all(Array.from({ length: workerCount }, writer));
  if (fatalError) throw fatalError;
  if (shouldStop()) return;

  if (!verifying) {
    onEvent({ type: "done" });
    return;
  }

  onEvent({ type: "phase", phase: "swap", total: sentences.length });
  await unloadModel(GENERATOR_MODEL);
  if (shouldStop()) return;

  onEvent({ type: "phase", phase: "verify", total: sentences.length });

  let checked = 0;
  for (const unit of sentences) {
    if (shouldStop()) return;
    const candidate = candidates.get(unit.index);
    if (!candidate) continue;
    try {
      const patch = await checkCandidate(unit, candidate, {
        level: normalizedLevel,
        protect: normalizedProtect
      });
      if (shouldStop()) return;
      onEvent(patch);
    } catch (error) {
      if (isFatalModelError(error)) throw error;
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
