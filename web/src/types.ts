export type Status = "checking" | "faithful" | "flagged" | "unchanged" | "error";

export interface Readability {
  grade: number;
  ease: number;
  words: number;
  sentences: number;
}

export interface SentenceResult {
  index: number;
  original: string;
  plain: string;
  status: Status;
  issues: string[];
  reason?: string;
  model?: string;
  escalated?: boolean;
  ms?: number;
  verifyMs?: number;
  readability: { before: Readability; after: Readability };
  errorCode?: string;
}

export interface Meta {
  total: number;
  headings: number;
  mode: string;
  generator: string;
  verifier: string | null;
}

export interface Health {
  ollama: boolean;
  models: string[];
  generator: { name: string; installed: boolean };
  verifier: { name: string; installed: boolean };
}

export type Phase = "write" | "verify";

export interface VerifyPatch {
  type: "verify";
  index: number;
  plain?: string;
  status: Status;
  issues: string[];
  reason?: string;
  model?: string;
  escalated?: boolean;
  verifyMs?: number;
  readability?: { before: Readability; after: Readability };
  errorCode?: string;
}

export type StreamEvent =
  | ({ type: "sentence" } & SentenceResult)
  | VerifyPatch
  | { type: "heading"; index: number; text: string }
  | ({ type: "meta" } & Meta)
  | { type: "phase"; phase: Phase; total: number }
  | { type: "progress"; phase: Phase; done: number; total: number }
  | { type: "done" }
  | { type: "fatal"; error: string; code: string };
