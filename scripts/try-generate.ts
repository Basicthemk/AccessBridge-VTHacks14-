// Local check against the real Gemini API:
//   npx tsx --env-file=.env.local scripts/try-generate.ts <transcript.txt> <dyslexia|deaf_hoh>
import { readFileSync } from "node:fs";
import { generateStudyMaterial, GenerateError } from "../lib/generate-study-material";

async function main() {
  const [file, profile] = process.argv.slice(2);
  const transcript = readFileSync(file, "utf8");
  const t0 = Date.now();
  try {
    const m = await generateStudyMaterial(profile as "dyslexia" | "deaf_hoh", transcript);
    console.log(JSON.stringify(m, null, 2));
    console.error(`ok in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${transcript.length} chars in`);
  } catch (e) {
    console.error("FAILED", e instanceof GenerateError ? [e.userMessage, e.detail] : e);
    process.exit(1);
  }
}
main();
