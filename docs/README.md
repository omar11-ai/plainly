# Plainly — screenshot set

Captured from the app running locally against Ollama (RTX 2060 6GB). The Seiko
instrument on every screen carries the live telemetry: reading level, pass rate,
model pair, engine, and the grade shift for the current document.

| File | What it shows |
|---|---|
| `01-hero-desktop.png` | Landing view with `LOCAL READY` and the instrument reporting a real grade shift (14.5 → 9.2, 88% facts kept) |
| `02-input-console.png` | Step 01 source text with the sample passage loaded; step 02 reading level |
| `03-options-drawer.png` | Collapsible Options drawer: checking mode, Scientific / Legal protection, paragraph-by-paragraph chunking |
| `04-results-verified.png` | Aligned original/plain cards after verification, word-level diff, escalation chips, and entity pills |
| `05-card-detail.png` | Single card: grade change, escalation, diff highlighting, listen button |
| `06-mobile-hero.png` | Same layout collapsed to a 390px viewport |

## Regenerating

Start the API, open `http://127.0.0.1:8787`, load **Full passage**, choose a
level, and press **Make it plain**. The instruments in `01` and `04` fill with
live values only while Ollama is reachable.