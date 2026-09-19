import { GoogleGenAI, createPartFromUri, createUserContent, FileState } from "@google/genai";
import { generateWithFallback } from "./gemini";
import { parseBuffer } from "music-metadata";
import { keepTrustedTimestamps, parseTranscript, stripTimestamps } from "./transcript-time";

const NO_SPEECH = "[NO_SPEECH]";

const PROMPT = `Transcribe this lecture recording word for word.
- Write plain text in paragraphs, breaking at natural pauses or topic changes.
- Begin every paragraph with the time it starts in the recording, in square brackets: [m:ss], or [h:mm:ss] once past an hour. For example [0:00] then [0:48] then [12:05]. Times must only move forward.
- Do not summarise, explain, translate, or add headings.
- Mark unclear words as [inaudible].
- Write only words that are actually spoken in this recording. Never invent, continue, or fill in a lecture from what such a lecture might say.
- If the recording is silent, or holds only noise, music, or too little speech to transcribe, reply with exactly ${NO_SPEECH}.`;

// Fast talkers reach about 5 words a second. A transcript with far more words than the recording
// could hold, or with times past its end, was made up, not heard.
const MAX_WORDS_PER_SECOND = 6;
const WORD_SLACK = 20;
const TIME_SLACK_SECONDS = 15;

/** The recording's length in seconds, or null when the format can't be read (the check is then skipped). */
async function durationSeconds(bytes: Uint8Array, mimeType: string): Promise<number | null> {
  try {
    const meta = await parseBuffer(bytes, { mimeType });
    const d = meta.format.duration;
    return typeof d === "number" && Number.isFinite(d) && d > 0 ? d : null;
  } catch {
    return null;
  }
}

/** True when the transcript can't fit the recording, which is how a model's invented text looks. */
export function looksInvented(text: string, seconds: number): boolean {
  const blocks = parseTranscript(text);
  const words = blocks.reduce((n, b) => n + b.text.split(/\s+/).filter(Boolean).length, 0);
  const lastMark = blocks.reduce((m, b) => Math.max(m, b.seconds ?? 0), 0);
  return words > seconds * MAX_WORDS_PER_SECOND + WORD_SLACK || lastMark > seconds + TIME_SLACK_SECONDS;
}

/** An error whose message is safe to show to the student. `detail` is for server logs only. */
export class TranscribeError extends Error {
  constructor(public userMessage: string, public detail?: string) {
    super(userMessage);
  }
}

function explain(err: unknown): TranscribeError {
  if (err instanceof TranscribeError) return err;
  const status = (err as { status?: number })?.status;
  const detail = err instanceof Error ? err.message : String(err);
  if (status === 429)
    return new TranscribeError("The transcription service is busy or over its quota. Wait a minute, then try again.", detail);
  if (status === 400)
    return new TranscribeError("The transcription service couldn’t read this recording. Re-export it as MP3 or WAV and upload it again.", detail);
  if (status === 401 || status === 403)
    return new TranscribeError("The transcription service rejected our API key. This is a setup problem on our side, not with your file.", detail);
  if (status && status >= 500)
    return new TranscribeError("The transcription service had a temporary problem. Try again in a moment.", detail);
  return new TranscribeError("Transcription failed unexpectedly. Try again.", detail);
}

/** Fetches the recording from a short-lived signed URL and returns its transcript. */
export async function transcribeFromUrl(signedUrl: string, mimeType: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new TranscribeError("Transcription isn’t set up yet: the server has no API key.");
  const ai = new GoogleGenAI({ apiKey });

  let uploadedName: string | undefined;
  try {
    const res = await fetch(signedUrl);
    if (!res.ok) throw new TranscribeError("We couldn’t read the recording from storage. Try again.", `storage ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const seconds = await durationSeconds(bytes, mimeType);
    const blob = new Blob([bytes], { type: mimeType });

    // The Files API takes recordings up to 2 GB; inline data caps at 20 MB.
    let file = await ai.files.upload({ file: blob, config: { mimeType } });
    uploadedName = file.name;
    for (let i = 0; i < 60 && file.state === FileState.PROCESSING; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      file = await ai.files.get({ name: file.name! });
    }
    if (file.state !== FileState.ACTIVE)
      throw new TranscribeError("The recording couldn’t be processed. Re-export it as MP3 or WAV and try again.", `file state ${file.state}`);

    const response = await generateWithFallback(ai, {
      contents: createUserContent([createPartFromUri(file.uri!, file.mimeType!), PROMPT]),
      config: { temperature: 0, maxOutputTokens: 65536 },
      parse: (r) => r,
      log: "transcribe",
    });

    const text = (response.text ?? "").trim();
    // The times are checked below; "no speech" is judged on the words alone.
    const words = stripTimestamps(text);
    const finish = response.candidates?.[0]?.finishReason;
    if (finish === "MAX_TOKENS")
      throw new TranscribeError("This recording is too long to transcribe in one go. Upload a shorter section.", "MAX_TOKENS");
    // "[inaudible]" alone is the model saying it heard nothing, so it counts as no speech too.
    const heard = /[A-Za-z0-9\u00C0-\uFFFF]/.test(words.replace(/\[inaudible\]/gi, ""));
    if (!heard || words === NO_SPEECH)
      throw new TranscribeError("We didn’t hear any speech in this recording. Check that it plays with sound, then try again.", `finish ${finish}`);
    // Written up here, before the times are trimmed, so a made-up "0:14" on a 3-second file is still seen.
    if (seconds !== null && looksInvented(text, seconds))
      throw new TranscribeError(
        "We couldn’t find clear speech in this recording, so we didn’t make a transcript. Check that it plays with sound, then try again.",
        `invented? ${seconds.toFixed(1)}s of audio, ${words.split(/\s+/).length} words`
      );
    return keepTrustedTimestamps(text);
  } catch (err) {
    throw explain(err);
  } finally {
    if (uploadedName) await ai.files.delete({ name: uploadedName }).catch(() => {});
  }
}
