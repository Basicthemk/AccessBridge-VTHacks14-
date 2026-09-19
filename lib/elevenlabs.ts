// Server-only text-to-speech. Docs: https://elevenlabs.io/docs/api-reference/text-to-speech/convert

/** Flash v2.5 is the cheapest model and accepts up to 40,000 characters per request. */
export const TTS_MODEL = "eleven_flash_v2_5";
/** Small MP3: plenty for speech, and quick to download on a slow connection. */
export const TTS_FORMAT = "mp3_44100_64";
/** Premade voice "Sarah". Override with ELEVENLABS_VOICE_ID. */
const DEFAULT_VOICE = "EXAVITQu4vr4xnSDxMaL";
export const TTS_VOICE = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
const TIMEOUT_MS = 90_000;

export class SpeechError extends Error {
  constructor(public userMessage: string, public detail?: string) {
    super(userMessage);
  }
}

export async function synthesize(text: string): Promise<{ audio: Buffer; characterCost: number | null }> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new SpeechError("Read aloud isn’t set up yet: the server has no audio key.");

  let res: Response;
  try {
    res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(TTS_VOICE)}?output_format=${TTS_FORMAT}`,
      {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({ text, model_id: TTS_MODEL }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    );
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new SpeechError(
      timedOut ? "Making the audio took too long. Try again." : "We couldn’t reach the audio service. Try again.",
      String(err)
    );
  }

  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    let status = "";
    try {
      status = JSON.parse(raw)?.detail?.status ?? "";
    } catch {
      // Not JSON; the raw text goes in the log detail.
    }
    const detail = `${res.status} ${status} ${raw.slice(0, 300)}`;
    if (status === "quota_exceeded") {
      throw new SpeechError("Read aloud has used up its audio allowance for now. Try again later.", detail);
    }
    if (res.status === 401 || status === "invalid_api_key") {
      throw new SpeechError("Read aloud isn’t working right now because the audio key was rejected.", detail);
    }
    if (res.status === 429) throw new SpeechError("The audio service is busy. Wait a moment, then try again.", detail);
    if (status === "voice_not_found") throw new SpeechError("Read aloud isn’t working right now: the voice is unavailable.", detail);
    throw new SpeechError("The audio service couldn’t make this audio. Try again.", detail);
  }

  const audio = Buffer.from(await res.arrayBuffer());
  if (audio.length === 0) throw new SpeechError("The audio service returned nothing. Try again.");
  const cost = Number(res.headers.get("character-cost"));
  return { audio, characterCost: Number.isFinite(cost) && res.headers.has("character-cost") ? cost : null };
}
