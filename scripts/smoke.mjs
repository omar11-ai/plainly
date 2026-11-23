import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const mode = process.argv[2] || "fast";

function sampleText() {
  const source = readFileSync(join(here, "..", "web", "src", "sample.ts"), "utf8");
  const match = source.match(/`([\s\S]*)`/);
  return match ? match[1] : "";
}

const text =
  process.argv[3] === "--sample"
    ? sampleText()
    : process.argv[3] ||
      "The hippocampus replays patterns of activity during slow-wave sleep. Participants who slept for at least 7 hours retained roughly 20 percent more items than participants who stayed awake.";

const started = Date.now();
const res = await fetch("http://127.0.0.1:8787/api/simplify", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ text, mode })
});

if (!res.ok) {
  console.error(`HTTP ${res.status}`, await res.text());
  process.exit(1);
}

const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";
  for (const line of lines) {
    if (!line.trim()) continue;
    const event = JSON.parse(line);
    if (event.type === "sentence") {
      console.log(
        `[${event.index}] wrote ${event.status} ${event.ms}ms\n  ORIG: ${event.original}\n  PLAIN: ${event.plain}`
      );
    } else if (event.type === "verify") {
      console.log(
        `[${event.index}] checked ${event.status} ${event.verifyMs}ms${event.escalated ? " (escalated)" : ""}\n  PLAIN: ${event.plain}${
          event.issues.length ? `\n  ISSUES: ${event.issues.join(" | ")}` : ""
        }${event.reason ? `\n  WHY: ${event.reason}` : ""}`
      );
    } else if (event.type === "progress") {
      continue;
    } else {
      console.log(JSON.stringify(event));
    }
  }
}

if (buffer.trim()) console.log(buffer);
console.log(`total: ${((Date.now() - started) / 1000).toFixed(1)}s`);
