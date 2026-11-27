/**
 * Google Gemini as a hosted model provider.
 *
 * The app's whole pipeline — the writer prompt, the deterministic entity layer,
 * the 7B verifier prompt, feedback-aware escalation — lives in the server files
 * and talks to a model only through `generateJson`. With no local server
 * behind it (a static GitHub Pages build), this installs a Gemini client into
 * that same seam, so the pipeline runs unchanged in the browser instead of a
 * watered-down second implementation.
 *
 * The API key belongs to whoever is using the site: it is entered in the UI and
 * kept in `localStorage`, never in the repo and never in the bundle.
 */

import { setModelNames } from "../../server/config.mjs";
// @ts-ignore — the pipeline is plain JS shared with the server.
import { processText } from "../../server/pipeline.mjs";
import type { ProtectOptions, ReadingLevel, StreamEvent } from "./types";

const API = "https://generativelanguage.googleapis.com/v1beta/models";
export const CLOUD_MODEL = "gemini-2.5-flash";
const KEY_STORAGE = "plainly.gemini.key";

export type CloudStatus = "off" | "on" | "error";

export function loadKey(): string {
  try {
    return window.localStorage.getItem(KEY_STORAGE) || "";
  } catch {
    return "";
  }
}

export function saveKey(key: string) {
  try {
    if (key) window.localStorage.setItem(KEY_STORAGE, key);
    else window.localStorage.removeItem(KEY_STORAGE);
  } catch {
    // A private-mode browser can refuse storage; the key just won't persist.
  }
}

/**
 * Turn a Google error into something a reader can act on. The API returns the
 * same shape for a bad key, a key over quota and a model that isn't enabled,
 * and the raw message is useless to them.
 */
function cloudError(status: number, message: string): Error {
  const low = message.toLowerCase();
  if (status === 400 || status === 401 || status === 403) {
    if (low.includes("api_key_invalid") || low.includes("api key not valid")) {
      return Object.assign(new Error("That Google API key was not accepted."), {
        code: "cloud_key"
      });
    }
    return Object.assign(new Error(message.slice(0, 160)), { code: "cloud_error" });
  }
  if (status === 429) {
    return Object.assign(
      new Error("That key is out of quota. Wait a minute, or use a different key."),
      { code: "cloud_quota" }
    );
  }
  if (status === 404) {
    return Object.assign(new Error(`The ${CLOUD_MODEL} model is not available to that key.`), {
      code: "cloud_model"
    });
  }
  return Object.assign(new Error(message.slice(0, 160) || `The API answered ${status}.`), {
    code: "cloud_error"
  });
}

/** The model seam. Same signature as the Ollama client. */
export async function generateJson(args: {
  system?: string;
  prompt: string;
  temperature?: number;
  numPredict?: number;
}): Promise<Record<string, unknown>> {
  const key = loadKey();
  if (!key) {
    throw Object.assign(new Error("Add a Google API key to run this."), {
      code: "cloud_no_key"
    });
  }

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: args.prompt }] }],
    generationConfig: {
      temperature: args.temperature ?? 0.2,
      maxOutputTokens: args.numPredict || 1024,
      responseMimeType: "application/json"
    }
  };
  if (args.system) {
    // systemInstruction is the proper place for it; concatenating into the
    // prompt would bleed the instructions into the measured rewrite.
    body.systemInstruction = { parts: [{ text: args.system }] };
  }

  let res: Response;
  try {
    res = await fetch(`${API}/${CLOUD_MODEL}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90000)
    });
  } catch (error) {
    if ((error as Error)?.name === "TimeoutError") {
      throw Object.assign(new Error("The API took too long to answer."), {
        code: "cloud_timeout"
      });
    }
    throw Object.assign(new Error("Google's API could not be reached."), {
      code: "cloud_offline"
    });
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    let message = `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(detail);
      message = parsed?.error?.message || message;
    } catch {
      if (detail) message = detail.slice(0, 160);
    }
    throw cloudError(res.status, message);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string" || !text.trim()) {
    throw Object.assign(new Error("The API returned no text."), { code: "cloud_empty" });
  }
  try {
    return JSON.parse(stripFences(text)) as Record<string, unknown>;
  } catch {
    throw Object.assign(new Error("The API answered with something that was not JSON."), {
      code: "cloud_bad_json"
    });
  }
}

/** Models sometimes wrap JSON in a fence despite responseMimeType. */
function stripFences(text: string): string {
  const body = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return body.trim();
}

/** Install the client into the pipeline's model seam. */
export function installCloudProvider() {
  (globalThis as Record<string, unknown>).__plainly_provider = { generateJson };
  setModelNames(CLOUD_MODEL, CLOUD_MODEL);
}

export function removeCloudProvider() {
  delete (globalThis as Record<string, unknown>).__plainly_provider;
  setModelNames("qwen2.5:3b", "qwen2.5:7b");
}

/** True when a key is present, so the app can offer the hosted path. */
export function cloudReady(): boolean {
  return Boolean(loadKey());
}

export function maskedKey(): string {
  const key = loadKey();
  if (!key) return "";
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

/**
 * Run the pipeline locally, emitting the same events the API stream would.
 * Same signature as `streamSimplify`, so `App` can swap between them.
 */
export async function runCloudSimplify({
  text,
  mode,
  level,
  protect,
  signal,
  onEvent
}: {
  text: string;
  mode: "verified" | "fast";
  level: ReadingLevel;
  protect: ProtectOptions;
  signal: AbortSignal;
  onEvent: (event: StreamEvent) => void;
}): Promise<void> {
  await processText({
    text,
    mode,
    level,
    protect,
    onEvent,
    shouldStop: () => signal.aborted
  });
}

/**
 * Prove a key before trusting it: one cheap call, so a bad key is found now
 * rather than halfway through a document.
 */
export async function testKey(key: string): Promise<string | null> {
  try {
    await (async () => {
      const res = await fetch(`${API}/${CLOUD_MODEL}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Reply with the word ready." }] }],
          generationConfig: { maxOutputTokens: 8 }
        }),
        signal: AbortSignal.timeout(30000)
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        let message = `HTTP ${res.status}`;
        try {
          message = JSON.parse(detail)?.error?.message || message;
        } catch {}
        throw cloudError(res.status, message);
      }
    })();
    return null;
  } catch (error) {
    return (error as Error).message || "That key did not work.";
  }
}