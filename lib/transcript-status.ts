// A run older than this is treated as dead: the function's 300 s limit has passed.
export const STALE_AFTER_MS = 6 * 60 * 1000;

export type LectureTranscriptRow = {
  transcript: string | null;
  transcript_status: "pending" | "processing" | "ready" | "failed";
  transcript_error: string | null;
  transcript_started_at: string | null;
};

export type TranscriptState =
  | { kind: "pending" }
  | { kind: "processing" }
  | { kind: "ready" }
  | { kind: "failed"; message: string };

export function transcriptState(row: LectureTranscriptRow, now = Date.now()): TranscriptState {
  if (row.transcript_status === "ready" || (row.transcript && row.transcript_status !== "processing")) {
    return { kind: "ready" };
  }
  if (row.transcript_status === "processing") {
    const started = row.transcript_started_at ? Date.parse(row.transcript_started_at) : 0;
    if (now - started > STALE_AFTER_MS) {
      return {
        kind: "failed",
        message: "Transcription took too long and was stopped. Try again, or upload a shorter recording.",
      };
    }
    return { kind: "processing" };
  }
  if (row.transcript_status === "failed") {
    return { kind: "failed", message: row.transcript_error || "Transcription failed. Try again." };
  }
  return { kind: "pending" };
}
