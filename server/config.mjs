/**
 * Configuration and environment.
 *
 * The browser has no `process`, and the web build imports this module to share
 * the pipeline logic, so read env defensively and export the model names as
 * live bindings: a hosted model provider can change them at runtime (see
 * `setModelNames`) and every importer sees the new value without being touched.
 */

const env =
  typeof process === "object" && process && process.env ? process.env : {};

export let GENERATOR_MODEL = env.GENERATOR_MODEL || "qwen2.5:3b";
export let VERIFIER_MODEL = env.VERIFIER_MODEL || "qwen2.5:7b";

/**
 * Swap the model names the pipeline reports and compares against. Used when a
 * hosted provider is installed, where both roles are the same cloud model.
 */
export function setModelNames(generator, verifier) {
  if (typeof generator === "string" && generator) GENERATOR_MODEL = generator;
  if (typeof verifier === "string" && verifier) VERIFIER_MODEL = verifier;
}

export const PORT = Number(env.PORT || 8787);
export const OLLAMA_URL = env.OLLAMA_URL || "http://127.0.0.1:11434";
export const DEFAULT_MODE = "verified";
export const MAX_TEXT_CHARS = 60000;
export const MODEL_TIMEOUT_MS = 120000;