# Plainly — screenshot set

Captured from the app running locally against Ollama (RTX 2060 6GB). The design
reads edge to edge: a scroll-reactive pixel rail on the left, a matching pixel
rail on the right, and one instrument poster in the middle.

The visual language is a Japanese digital-instrument poster built from pixel
primitives: Silkscreen for every label, button, and badge, Inter for anything a
reader actually has to read, hard offset shadows instead of soft blurs, squared
corners, amber registration marks pinned to panel corners, and dithered pixel
dividers between sections.

| File | What it shows |
|---|---|
| `01-hero-desktop.png` | Hero poster. The frame is one gradient — stone canvas on the left dissolving into matte carbon on the right — and the Seiko chronograph sits *inside* that black half rather than floating in a separate box |
| `02-input-console.png` | Step 01 source text: sample and PDF entry, word and character count |
| `03-options-drawer.png` | Reading level dial, verification pass, protected terms, and paragraph-by-paragraph chunking |
| `04-results-verified.png` | Aligned original/plain cards after verification: word-level diff, escalation chips, entity pills, Why? popovers, audio sync |
| `05-cards-detail.png` | Full width in use — cards, rails, and the telemetry deck below |
| `06-mobile-hero.png` | Same layout stacked to a 390px viewport; the hero keeps the light-to-carbon gradient with the instrument in the black band |

## Regenerating

Start the API, open `http://127.0.0.1:8787`, load **Full passage**, choose a
level, and press **Make it plain**. The instruments in `01` and `04` fill with
live values only while Ollama is reachable.