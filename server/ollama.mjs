import { OLLAMA_URL, MODEL_TIMEOUT_MS } from "./config.mjs";

export class OllamaError extends Error {
  constructor(message, code = "ollama_error", status = 502) {
    super(message);
    this.name = "OllamaError";
    this.code = code;
    this.status = status;
  }
}

async function request(path, init = {}, { model } = {}) {
  let res;
  try {
    res = await fetch(`${OLLAMA_URL}${path}`, {
      ...init,
      signal: AbortSignal.timeout(MODEL_TIMEOUT_MS)
    });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      throw new OllamaError("The local model took too long to answer.", "model_timeout", 504);
    }
    throw new OllamaError(
      "The local model is not reachable. Start Ollama and try again.",
      "model_offline",
      503
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 404) {
      const target = model || "qwen2.5:3b";
      throw new OllamaError(
        `Model "${target}" is not installed. Run: ollama pull ${target}`,
        "model_missing",
        503
      );
    }
    throw new OllamaError(`Model request failed (${res.status}). ${body.slice(0, 200)}`, "model_error");
  }
  return res;
}

export async function listModels() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) return { online: false, models: [] };
    const data = await res.json();
    return { online: true, models: (data.models || []).map((m) => m.name) };
  } catch {
    return { online: false, models: [] };
  }
}

export async function generate({
  model,
  system,
  prompt,
  format,
  temperature = 0.2,
  numPredict = 320,
  keepAlive = "30m",
  numCtx = 2048
}) {
  const res = await request(
    "/api/generate",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        system,
        prompt,
        stream: false,
        format,
        keep_alive: keepAlive,
        options: { temperature, num_predict: numPredict, top_p: 0.9, num_ctx: numCtx }
      })
    },
    { model }
  );
  const data = await res.json();
  if (!data?.response) {
    throw new OllamaError("The local model returned an empty answer.", "model_empty");
  }
  return data.response.trim();
}

export function parseJsonLoose(text) {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    return null;
  }
}

export async function generateJson(args) {
  // A hosted provider, when one is installed. The static build has no server
  // behind it, so the browser installs a Google Gemini client here and the
  // whole pipeline — prompts, the deterministic entity layer, escalation —
  // runs unchanged. Held on globalThis so a bundled copy and any dynamically
  // imported copy of this module share the same hook.
  const hosted = provider();
  if (hosted) return hosted.generateJson(args);

  const raw = await generate({ ...args, format: "json" });
  const parsed = parseJsonLoose(raw);
  if (!parsed) {
    throw new OllamaError("The local model returned an unreadable answer.", "model_bad_json");
  }
  return parsed;
}

function provider() {
  return typeof globalThis === "object" && globalThis
    ? globalThis.__plainly_provider || null
    : null;
}

export async function warmModel(model) {
  try {
    await generate({
      model,
      prompt: "Reply with the word ready.",
      numPredict: 4,
      temperature: 0
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Ask Ollama to drop a model from memory. On a 6GB card the 3B and 7B cannot
 * both stay resident, so the pipeline unloads the writer before it starts the
 * checker. Otherwise Ollama partially offloads the 7B to the CPU and every
 * verification crawls.
 */
export async function unloadModel(model) {
  // Nothing to evict from a hosted API; the swap is already free there.
  if (provider()) return;
  try {
    await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: "", keep_alive: 0 }),
      signal: AbortSignal.timeout(15000)
    });
  } catch {
    // Best effort: the next load evicts the old model anyway.
  }
}
