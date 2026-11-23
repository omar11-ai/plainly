export const PORT = Number(process.env.PORT || 8787);
export const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
export const GENERATOR_MODEL = process.env.GENERATOR_MODEL || "qwen2.5:3b";
export const VERIFIER_MODEL = process.env.VERIFIER_MODEL || "qwen2.5:7b";
export const DEFAULT_MODE = "verified";
export const MAX_TEXT_CHARS = 60000;
export const MODEL_TIMEOUT_MS = 120000;
