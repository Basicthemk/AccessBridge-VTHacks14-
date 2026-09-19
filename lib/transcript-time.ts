// Timestamps live inside the transcript text: each paragraph may begin with its start time,
// "[0:42]" or "[1:02:45]". Keeping them in the text means no extra column, and a transcript
// made before timestamps existed is just paragraphs with no times.

export type TranscriptBlock = { seconds: number | null; text: string };

// [m:ss], [mm:ss] or [h:mm:ss] at the very start of a paragraph.
const MARK = /^\[(?:(\d{1,2}):)?(\d{1,3}):(\d{2})\]\s*/;

function secondsOf(hours: string | undefined, minutes: string, seconds: string): number | null {
  const h = hours === undefined ? 0 : Number(hours);
  const m = Number(minutes);
  const s = Number(seconds);
  if (s > 59 || (hours !== undefined && m > 59)) return null;
  return h * 3600 + m * 60 + s;
}

/** Splits a transcript into paragraphs, reading each one's start time if it has one. */
export function parseTranscript(raw: string): TranscriptBlock[] {
  return raw
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const m = MARK.exec(p);
      if (!m) return { seconds: null, text: p };
      const seconds = secondsOf(m[1], m[2], m[3]);
      return { seconds, text: p.slice(m[0].length).trim() };
    })
    .filter((b) => b.text !== "");
}

/** The transcript as plain paragraphs, with no times. This is what the study-material model reads. */
export function stripTimestamps(raw: string): string {
  return parseTranscript(raw)
    .map((b) => b.text)
    .join("\n\n");
}

/** "0:42", "12:05", or "1:02:45" once past an hour. */
export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/**
 * Keeps the times a model wrote only if they can be trusted: every paragraph has one, they never
 * run backwards, and they move forward overall. Otherwise the times are dropped and the plain
 * transcript is kept, so a bad guess at times never costs the student their transcript.
 */
export function keepTrustedTimestamps(raw: string): string {
  const blocks = parseTranscript(raw);
  const times = blocks.map((b) => b.seconds);
  const allPresent = times.every((t): t is number => t !== null);
  const forward = allPresent && times.every((t, i) => i === 0 || t >= (times[i - 1] as number));
  const moved = blocks.length === 1 || (allPresent && (times[times.length - 1] as number) > (times[0] as number));
  if (!blocks.length || !allPresent || !forward || !moved) return stripTimestamps(raw);
  return blocks.map((b) => `[${formatTime(b.seconds as number)}] ${b.text}`).join("\n\n");
}
