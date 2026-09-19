import { GoogleGenAI, createPartFromUri, createUserContent, FileState } from "@google/genai";

// Newer models are often overloaded (503), so try the preferred one first, then older ones.
const MODELS = [process.env.GEMINI_MODEL || "gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash"];
const TRANSIENT = new Set([429, 500, 503, 504]);
const NO_SPEECH = "[NO_SPEECH]";

const PROMPT = `Transcribe this lecture recording word for word.
- Write plain text in paragraphs, breaking at natural pauses or topic changes.
- Do not summarise, explain, translate, or add timestamps or headings.
- Mark unclear words as [inaudible].
- If the recording contains no speech, reply with exactly ${NO_SPEECH}.`;

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

type Contents = ReturnType<typeof createUserContent>;

async function generate(ai: GoogleGenAI, contents: Contents) {
  let last: unknown;
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await ai.models.generateContent({
          model,
          contents,
          config: { temperature: 0, maxOutputTokens: 65536 },
        });
      } catch (err) {
        last = err;
        const status = (err as { status?: number })?.status;
        if (status === 404) break; // model retired for this key: go to the next one
        if (!status || !TRANSIENT.has(status)) throw err;
        console.warn("transcribe: transient", status, "from", model);
        if (attempt === 0) await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }
  throw last;
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
    const blob = new Blob([await res.arrayBuffer()], { type: mimeType });

    // The Files API takes recordings up to 2 GB; inline data caps at 20 MB.
    let file = await ai.files.upload({ file: blob, config: { mimeType } });
    uploadedName = file.name;
    for (let i = 0; i < 60 && file.state === FileState.PROCESSING; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      file = await ai.files.get({ name: file.name! });
    }
    if (file.state !== FileState.ACTIVE)
      throw new TranscribeError("The recording couldn’t be processed. Re-export it as MP3 or WAV and try again.", `file state ${file.state}`);

    const response = await generate(ai, createUserContent([createPartFromUri(file.uri!, file.mimeType!), PROMPT]));

    const text = (response.text ?? "").trim();
    const finish = response.candidates?.[0]?.finishReason;
    if (finish === "MAX_TOKENS")
      throw new TranscribeError("This recording is too long to transcribe in one go. Upload a shorter section.", "MAX_TOKENS");
    if (!text || text === NO_SPEECH)
      throw new TranscribeError("We didn’t hear any speech in this recording. Check that it plays with sound, then try again.", `finish ${finish}`);
    return text;
  } catch (err) {
    throw explain(err);
  } finally {
    if (uploadedName) await ai.files.delete({ name: uploadedName }).catch(() => {});
  }
}
