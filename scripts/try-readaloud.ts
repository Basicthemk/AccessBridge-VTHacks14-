// Makes ONE short sample through the same code the app uses and reports the cost:
//   npx tsx --env-file=.env.local scripts/try-readaloud.ts
import { writeFileSync } from "node:fs";
import { TTS_FORMAT, TTS_MODEL, TTS_VOICE, SpeechError, synthesize } from "../lib/elevenlabs";

const SAMPLE = "Photosynthesis turns light into sugar. This is a short test.";

async function main() {
  console.error("model:", TTS_MODEL, "voice:", TTS_VOICE, "format:", TTS_FORMAT, "characters sent:", SAMPLE.length);
  try {
    const { audio, characterCost } = await synthesize(SAMPLE);
    const out = process.argv[2] ?? "readaloud-sample.mp3";
    writeFileSync(out, audio);
    console.log("ok:", audio.length, "bytes -> ", out, "| character-cost header:", characterCost);
    console.log("mp3 header bytes:", audio.subarray(0, 3).toString("hex"));
  } catch (e) {
    console.error("FAILED", e instanceof SpeechError ? [e.userMessage, e.detail] : e);
    process.exit(1);
  }
}
main();
