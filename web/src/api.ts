import type { Health, StreamEvent } from "./types";

export async function fetchHealth(): Promise<Health> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error("Health check failed");
  return res.json();
}

export async function extractPdf(file: File): Promise<{ text: string; pages: number }> {
  const res = await fetch("/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/pdf" },
    body: file
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(data.error || "This PDF could not be read."), {
      code: data.code || "pdf_error"
    });
  }
  return data;
}

export async function streamSimplify({
  text,
  mode,
  signal,
  onEvent
}: {
  text: string;
  mode: "verified" | "fast";
  signal: AbortSignal;
  onEvent: (event: StreamEvent) => void;
}): Promise<void> {
  const res = await fetch("/api/simplify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, mode }),
    signal
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw Object.assign(new Error(data.error || "The simplifier could not start."), {
      code: data.code || "request_error"
    });
  }
  if (!res.body) throw new Error("The browser could not read the response stream.");

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
      try {
        onEvent(JSON.parse(line) as StreamEvent);
      } catch {
        // Ignore a partial line; the next chunk completes it.
      }
    }
  }

  if (buffer.trim()) {
    try {
      onEvent(JSON.parse(buffer) as StreamEvent);
    } catch {
      // Ignore trailing noise.
    }
  }
}
