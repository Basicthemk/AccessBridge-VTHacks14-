import { STALE_AFTER_MS } from "./transcript-status";

export type GeneratedContentRow = {
  status: "processing" | "ready" | "failed";
  error: string | null;
  started_at: string | null;
  content_json: unknown;
};

export type GenerationState =
  | { kind: "none" }
  | { kind: "processing" }
  | { kind: "ready" }
  | { kind: "failed"; message: string };

/** `row` is null when nothing has been generated for this lecture and profile yet. */
export function generationState(row: GeneratedContentRow | null, now = Date.now()): GenerationState {
  if (!row) return { kind: "none" };
  if (row.status === "processing") {
    const started = row.started_at ? Date.parse(row.started_at) : 0;
    if (now - started > STALE_AFTER_MS) {
      return { kind: "failed", message: "Making the study material took too long and was stopped. Try again." };
    }
    return { kind: "processing" };
  }
  if (row.status === "failed") {
    return { kind: "failed", message: row.error || "Making the study material failed. Try again." };
  }
  return row.content_json ? { kind: "ready" } : { kind: "none" };
}
