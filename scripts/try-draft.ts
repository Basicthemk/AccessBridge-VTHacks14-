// Local check against the real Gemini API:
//   npx tsx --env-file=.env.local scripts/try-draft.ts <dyslexia|deaf_hoh>
import { generateAccommodationDraft, DraftError } from "../lib/accommodation-draft";
import { checkBody } from "../lib/accommodation";

async function main() {
  const profile = process.argv[2] as "dyslexia" | "deaf_hoh";
  const t0 = Date.now();
  try {
    const body = await generateAccommodationDraft(profile);
    console.log(body);
    console.error(`\nok in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${body.length} chars, ${body.split(/\s+/).length} words`);
    // The draft still has the name placeholder, so the send check must refuse it until the student edits.
    const check = checkBody(body);
    console.error("send check on the untouched draft:", check.ok ? "ACCEPTED (bug)" : `refused: ${check.message}`);
  } catch (e) {
    console.error("FAILED", e instanceof DraftError ? [e.userMessage, e.detail] : e);
    process.exit(1);
  }
}
main();
