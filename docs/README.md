# Plainly — screenshot set

Captured from the app running locally against Ollama (RTX 2060 6GB). Every image
is exactly 3:2 (`2400×1600`), ready to drop into the Devpost gallery. The design
reads edge to edge: a scroll-reactive pixel rail on the left, a matching rail on
the right, and one instrument poster down the middle.

The visual language is a Japanese digital-instrument poster built from pixel
primitives: Silkscreen for every label, button, and readout; Inter for anything a
reader actually has to read; hard offset shadows instead of soft blurs; squared
corners; amber registration marks pinned to panel corners; dithered pixel
dividers between sections.

| File | What it shows |
|---|---|
| `thumbnail-3x2.png` | Devpost thumbnail and gallery cover — the hero poster |
| `01-hero-desktop.png` | Hero. The frame is one gradient, stone canvas on the left dissolving into matte carbon on the right, and the Seiko chronograph sits *inside* that black half rather than floating in a separate box |
| `02-input-console.png` | Step 01 source text with the full passage loaded, the reading-level dial, and the telemetry deck reporting a live grade shift |
| `03-options-drawer.png` | Options drawer: verification pass, protected terms, and paragraph-by-paragraph chunking |
| `04-results-verified.png` | Aligned original/plain cards after verification — word-level diff, escalation chips, entity pills, Listen and Why? controls |
| `05-change-audit.png` | The "Why?" popover open, showing the change audit and which model produced the rewrite |

## Regenerating

Start the API, open `http://127.0.0.1:8787`, load **Full passage**, choose a
level, and press **Make it plain**. To reproduce the exact 3:2 crop, emulate a
viewport of `2415 × 1600` so the captured frame is `2400 × 1600` once the
scrollbar is subtracted.