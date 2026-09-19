import { MAX_BYTES } from "./upload";

// MediaRecorder output differs by browser: Chrome, Edge and Firefox usually give WebM/Opus
// (Firefox may give Ogg/Opus), Safari gives MP4/AAC. Each maps to a type the bucket allows.
// WebM audio is saved as .weba so the transcribe route sends Gemini "audio/webm", not "video/webm".
const CANDIDATES: { mime: string; ext: string }[] = [
  { mime: "audio/webm;codecs=opus", ext: "weba" },
  { mime: "audio/webm", ext: "weba" },
  { mime: "audio/mp4", ext: "m4a" },
  { mime: "audio/ogg;codecs=opus", ext: "ogg" },
];

// 64 kbps Opus is clear for speech and keeps 50 MB to roughly 100 minutes.
export const RECORDING_BITS_PER_SECOND = 64_000;
// Stop just under the bucket's per-file limit so the upload is never rejected as too large.
export const RECORDING_STOP_BYTES = MAX_BYTES - 1024 * 1024;

export function recordingSupport(): "ok" | "no-recorder" | "insecure" {
  if (typeof window === "undefined") return "ok";
  if (!window.isSecureContext) return "insecure";
  if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return "no-recorder";
  return "ok";
}

/** The format to ask MediaRecorder for. Undefined lets the browser choose its own default. */
export function pickRecorderMime(): string | undefined {
  return CANDIDATES.find((c) => MediaRecorder.isTypeSupported(c.mime))?.mime;
}

/** Extension for what the recorder actually produced (its mimeType may carry a codecs suffix). */
export function extensionForRecording(mimeType: string): string | null {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  if (base === "audio/webm") return "weba";
  if (base === "audio/mp4" || base === "audio/x-m4a") return "m4a";
  if (base === "audio/ogg") return "ogg";
  return null;
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

/** Spoken form of a length, for screen readers and plain-text summaries. */
export function spokenDuration(totalSeconds: number): string {
  const s = Math.floor(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h} ${h === 1 ? "hour" : "hours"}`);
  if (m) parts.push(`${m} ${m === 1 ? "minute" : "minutes"}`);
  if (sec || parts.length === 0) parts.push(`${sec} ${sec === 1 ? "second" : "seconds"}`);
  return parts.join(" ");
}
