# Plainly

**Read it plainly. Keep the meaning.**

Plainly turns dense text into plain language, sentence by sentence, and checks every rewrite against the original before showing it as trustworthy. Everything runs on your own machine through [Ollama](https://ollama.com) — no API key, no account, and the text never leaves the computer.

Built for the **Global AI Builder's Challenge 2026**.

---

## The problem

Dense academic, legal, and policy text is a real barrier for readers with dyslexia, ADHD, or limited English. A general chatbot will happily simplify a paragraph, but it gives you no way to know whether a number, a name, or a hedge like *"may"* quietly disappeared. For anything you have to act on — a medical leaflet, a tenancy agreement, a paper you are citing — "sounds simpler" is not the same as "still true".

Plainly treats **fidelity as the product**, not a disclaimer.

## How it works

Two phases, one model load each:

1. **Write.** A 3B model rewrites one sentence at a time. Results stream into the page immediately, marked *Checking meaning*, with the original kept beside the rewrite.
2. **Check.** The writer is unloaded, a 7B model loads once, and each rewrite is compared against its original in reading order. It looks for dropped qualifiers, changed numbers or names, stronger certainty, and added claims.

A rewrite that fails the check gets one escalation: the 7B model rewrites it, the result is verified again, and the better version wins. A deterministic pass also checks numbers and proper nouns directly against the source, so a number can never disappear without a flag.

### Why two phases

The obvious implementation interleaves the models per sentence. On a 6GB GPU that is a disaster: swapping between a 3B and a 7B costs 12–24 seconds per reload, and it was happening on *every sentence*. Measured on an RTX 2060:

| | cold load | warm call |
|---|---|---|
| 3B rewrite | 11–15s | ~1–3s |
| 7B check | 17–21s | ~1.8s |
| 3B → 7B swap | **24s** | |

Batching by phase turns N swaps into one. An 8-sentence passage now takes about 90–110 seconds end to end, including both loads and one escalation.

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
- `POST /api/simplify` — `{ text, mode }` → NDJSON stream:
  - `meta`, `phase`, `heading`
  - `sentence` — a rewrite with status `checking` (verified mode) or final (fast mode)
  - `verify` — the verdict patch for an already-streamed sentence
  - `progress`, `done`

## Failure handling

- Ollama offline or a model missing → explicit banner, and finished sentences stay on screen
- Scanned PDF with no text layer → explicit message, never a silent empty result
- A model call that fails mid-document → that sentence is marked "Not processed" and the rest continue
- Stop button aborts the stream and keeps what has already been checked

## Honest limitations

- The checker is 7B. It is conservative and will occasionally flag a heavy but faithful paraphrase.
- On a 6GB GPU the 7B runs partly on CPU (~84% GPU here), which is why checks take about 1.8s each rather than milliseconds.
- The two-phase design optimises for one document per run. Starting a second document pays both model loads again.
- English only, one sentence at a time. Long documents are processed sequentially by design, so the page fills in reading order.

## AI disclosure

The models that rewrite and verify text run locally and are open-weight (Qwen2.5). No hosted AI service is used at runtime. This project was built with AI coding assistance, which is disclosed in the submission as required.
