# Plainly

**Read it plainly. Keep the meaning.**

Plainly turns dense text into plain language, sentence by sentence, and checks every rewrite against the original before showing it as trustworthy. Everything runs on your own machine through [Ollama](https://ollama.com) — no API key, no account, and the text never leaves the computer.

Built for the **Global AI Builder's Challenge 2026**.

---

## The problem

Dense academic, legal, and policy text is a real barrier for readers with dyslexia, ADHD, or limited English. A general chatbot will happily simplify a paragraph, but it gives you no way to know whether a number, a name, or a hedge like *"may"* quietly disappeared. For anything you have to act on — a medical leaflet, a tenancy agreement, a paper you are citing — "sounds simpler" is not the same as "still true".

Plainly treats **fidelity as the product**, not a disclaimer.

## How it works

Three phases, one model load each:

1. **Write.** A 3B model rewrites one unit at a time — sentences in order, headings passed through. Results stream into the page immediately, marked *Checking meaning*, with the original kept beside the rewrite.
2. **Swap.** The writer is unloaded once and the 7B model loads once.
3. **Check.** Each rewrite is compared against its original in reading order. It looks for dropped qualifiers, changed numbers or names, stronger certainty, and added claims.

Every rewrite carries four levers, all client-controlled:

- **Reading level** — Simple (G5–6), Everyday (G7–8), Clear (G9–10), or University (G11–12). The level sets the sentence-length budget and vocabulary, not just a label.
- **Mode** — Checked (3B → 7B) or Fast (3B only).
- **Protected terms** — Scientific, Legal / policy, or your own locked phrases. These are extracted as entities and checked verbatim.
- **Paragraph chunking** — run the whole document, or one paragraph at a time for faster turnaround.

The interesting part is the check. Two independent layers run:

- **Deterministic, before the LLM.** Numbers, dates, acronyms, proper names, and qualifiers are extracted from the source and matched against the rewrite. A number can never disappear without a flag, regardless of what the model says.
- **A 7B verifier**, which judges whether a reader would learn exactly the same thing, accepting synonyms and split sentences while rejecting changed scope, certainty, or facts.

A rewrite that fails either layer gets one escalation: the 7B rewrites it with the failures as feedback, the result is verified again, and the better version wins.

Each card then shows entity pills for what was checked — `# 20 percent ✓`, `NAME Walker ✓`, `SCOPE roughly ~`. A `✓` means the token survived verbatim. A `~` marks a soft hedge whose wording changed but whose meaning the verifier accepted, so it is deliberately **not** an error. A `✕` means the fact is genuinely gone.

### Why two phases

The obvious implementation interleaves the models per sentence. On a 6GB GPU that is a disaster: swapping between a 3B and a 7B costs 12–24 seconds per reload, and it was happening on *every sentence*. Measured on an RTX 2060:

| | cold load | warm call |
|---|---|---|
| 3B rewrite | 14.9s | 3.4s |
| 7B check | 23.8s | 1.5s |
| 3B → 7B swap | **12–24s** | |

Batching by phase turns N swaps into one. An 8-sentence passage takes **73 seconds** end to end — 39s writing, 34s checking — including both model loads and any escalations.

## What the check actually catches

The verifier is deliberately conservative: a false alarm costs you one glance, a missed change costs you trust.

It catches things like:

- `"roughly 20 percent"` → `"20 percent"` (approximation made exact)
- `"at least 7 hours"` → `"7 hours"` (lower bound dropped)
- `"in most, but not all, tested conditions"` → `"but not always"` (scope changed)
- `"may help"` → `"consolidates"` (hedge removed)
- `"30 percent of patients"` → `"most patients"`
- `"in mice"` → `"in people"`

It is trained by prompt to allow real plain-language moves: synonyms, reordered clauses, split sentences, and technical terms explained in everyday words.

## Results

Hand-built fidelity set, 17 cases (11 faithful rewrites, 6 with one specific broken fact):

```
17/17 correct · 0 false alarms on good rewrites · 0 missed errors
```

Run it yourself:

```bash
npm run eval     # writes eval/results/latest.json
npm run bench    # writer/checker latency and VRAM split on this machine
```

This is a small, hand-written set — a sanity check and a regression suite, not a benchmark claim. It grew out of real failures observed during the build, including one where the 3B model dropped "tested conditions" and the 7B checker caught it and rewrote the sentence correctly.

A separate live contract check exercises the real API end to end — level targets, locked terms, entity kinds, the phase sequence, writer JSON reliability, and fail-fast errors:

```bash
node scripts/verify-api.mjs    # 14 checks against a running server
```

## Design

A Japanese digital-instrument poster, built from pixel primitives and tuned for dyslexic and ADHD readers.

- **Layout** runs edge to edge: a scroll-reactive pixel rail on the left, a matching rail on the right, and one instrument poster down the middle. Nothing is centred in a narrow column.
- **Two type roles, deliberately.** Silkscreen carries every label, button, badge, and readout, so the interface itself feels like an instrument; Inter and the Flesch-Kincaid–friendly reading scale carry the sentences people actually read, at 18–24px with generous leading.
- **The hero is one gradient, not two boxes.** The frame fades from stone canvas on the left into matte carbon on the right, and the chronograph is set *into* that black half — clock, tiles, and amber LCD all live in the same surface.
- **Pixel affordances** carry the theme without decoration for its own sake: hard offset shadows instead of soft blurs, squared corners, amber registration marks pinned to panel corners, and dithered pixel dividers between sections.
- **Status colour is cohesive, not clichéd.** Warm amber for live states, muted ash-stone for standby, deep slate-teal for verified, ochre for needs-review. No traffic-light neon.

## Stack

- **Web:** Vite + React + TypeScript
- **API:** Node + Express, NDJSON streaming
- **Models:** `qwen2.5:3b` (writer), `qwen2.5:7b` (checker), via Ollama
- **PDF:** `pdfjs-dist` for selectable text; scanned PDFs fail with a clear message instead of an empty result

## Run

```bash
npm install
ollama pull qwen2.5:3b
ollama pull qwen2.5:7b

npm run dev      # API on :8787, Vite on :5173
```

Or build once and serve everything from the API:

```bash
npm run build
npm start        # http://127.0.0.1:8787
```

## API

- `GET /api/health` — Ollama reachability and which models are installed
- `POST /api/extract` — raw PDF bytes → text
- `POST /api/simplify` — `{ text, mode, level, protect }` → NDJSON stream:
  - `meta` — sentence count, level, target grade, which models are in use
  - `phase` — `write`, `swap`, or `verify`
  - `heading` — passed through without rewriting
  - `sentence` — a rewrite with status `checking` (verified mode) or final (fast mode)
  - `verify` — the verdict patch for an already-streamed sentence, carrying `status`, `issues`, `entities`, `escalated`, and `why`
  - `progress`, `done`

`level` is `simple` | `everyday` | `clear` | `university`. `protect` is `{ scientific, legal, customTerms }`, where `customTerms` are phrases that must survive verbatim.

## Failure handling

- Ollama offline or a model missing → fails fast with one named error and a single actionable message, before any card is written
- Scanned PDF with no text layer → explicit message, never a silent empty result
- A model call that fails mid-document → that sentence is marked "Not processed" and the rest continue
- Stop button aborts the stream and keeps what has already been checked
- No Ollama at all → the landing page offers a replay of a recorded 3B → 7B run, so the UI is still inspectable

## Honest limitations

- The checker is 7B. It is conservative and will occasionally flag a heavy but faithful paraphrase.
- On a 6GB GPU the 7B runs partly on CPU (~84% GPU here), which is why checks take about 1.5s each rather than milliseconds. Chrome and the desktop hold ~4.1GB of the card before Ollama starts.
- Reading level is enforced by prompt, not by construction. On dense sentences the 3B re-rolls up to three times, but it is a small model and can miss a target; the achieved grade is always shown, never claimed.
- Flesch-Kincaid counts syllables, so protected technical terms raise the measured floor. *Simple* plus *Scientific kept* on a medical paper sentence lands around grade 7, not grade 6, and that trade-off is displayed rather than hidden.
- The two-phase design optimises for one document per run. Starting a second document pays both model loads again.
- English only, one unit at a time. Documents are processed in reading order by design, so the page fills top to bottom.

## AI disclosure

The models that rewrite and verify text run locally and are open-weight (Qwen2.5). No hosted AI service is used at runtime. This project was built with AI coding assistance, which is disclosed in the submission as required.
