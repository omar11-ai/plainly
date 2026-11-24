import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

import { DEFAULT_MODE, MAX_TEXT_CHARS, PORT, GENERATOR_MODEL, VERIFIER_MODEL } from "./config.mjs";
import { listModels, warmModel } from "./ollama.mjs";
import { extractPdfText } from "./pdf.mjs";
import { processText } from "./pipeline.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", async (_req, res) => {
  const { online, models } = await listModels();
  const has = (name) => models.some((m) => m === name || m.startsWith(`${name}:`));
  res.json({
    ollama: online,
    models,
    generator: { name: GENERATOR_MODEL, installed: has(GENERATOR_MODEL) },
    verifier: { name: VERIFIER_MODEL, installed: has(VERIFIER_MODEL) }
  });
});

app.post(
  "/api/extract",
  express.raw({ type: ["application/pdf", "application/octet-stream"], limit: "30mb" }),
  async (req, res, next) => {
    try {
      if (!req.body || !req.body.length) {
        return res.status(400).json({ error: "No file received.", code: "empty_file" });
      }
      const result = await extractPdfText(req.body);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

app.post("/api/simplify", async (req, res) => {
  const { text, mode = DEFAULT_MODE, level = "everyday", protect = {} } = req.body || {};
  if (typeof text !== "string" || text.trim().length < 20) {
    return res.status(400).json({
      error: "Add at least a couple of sentences to simplify.",
      code: "text_too_short"
    });
  }
  if (text.length > MAX_TEXT_CHARS) {
    return res.status(413).json({
      error: `That text is too long for one pass. Keep it under ${MAX_TEXT_CHARS.toLocaleString()} characters.`,
      code: "text_too_long"
    });
  }

  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  let closed = false;
  res.on("close", () => {
    if (!res.writableEnded) closed = true;
  });

  const send = (event) => {
    if (!closed && !res.writableEnded) res.write(`${JSON.stringify(event)}\n`);
  };

  try {
    await processText({
      text,
      mode: mode === "fast" ? "fast" : "verified",
      level,
      protect,
      onEvent: send,
      shouldStop: () => closed
    });
  } catch (error) {
    send({
      type: "fatal",
      error: error?.message || "Something went wrong while simplifying.",
      code: error?.code || "pipeline_error"
    });
  } finally {
    if (!res.writableEnded) res.end();
  }
});

app.use((error, _req, res, _next) => {
  const status = error?.status || 500;
  res.status(status).json({
    error: error?.message || "Unexpected server error.",
    code: error?.code || "server_error"
  });
});

const dist = path.resolve(__dirname, "..", "dist");
app.use(express.static(dist));
app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Unknown API route.", code: "not_found" });
  }
  const indexFile = path.join(dist, "index.html");
  if (existsSync(indexFile)) return res.sendFile(indexFile);
  return res.status(503).send("The UI is not built yet. Run: npm run build");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Plainly API on http://0.0.0.0:${PORT}`);
  console.log(`Generator: ${GENERATOR_MODEL} · Verifier: ${VERIFIER_MODEL}`);
  warmModel(GENERATOR_MODEL).then((ready) => {
    console.log(`Model warm-up: generator ${ready ? "ready" : "unavailable"}`);
  });
});
