import { GoogleGenAI } from "@google/genai";
import { BadOutputError, DeadlineError, generateWithFallback } from "./gemini";
import type { DisabilityProfile } from "./profiles";
import { MAX_BODY, MIN_BODY, NAME_PLACEHOLDER } from "./accommodation";

/** The draft is short, so give it a much smaller budget than study material. */
const DRAFT_BUDGET_MS = 90_000;

/** An error whose message is safe to show to the student. `detail` is for server logs only. */
export class DraftError extends Error {
  constructor(public userMessage: string, public detail?: string) {
    super(userMessage);
  }
}

const ASKS: Record<DisabilityProfile, string> = {
  dyslexia: `The student has dyslexia. Ask for these accommodations:
- extended time on exams and timed assignments
- lecture transcripts or notes shared in advance, so they can read ahead at their own pace`,
  deaf_hoh: `The student is deaf or hard of hearing. Ask for these accommodations:
- captioning of lecture recordings, videos and live sessions
- lecture transcripts shared alongside the recordings`,
};

const INSTRUCTION = (profile: DisabilityProfile) => `You write a short, polite email from a college student to a professor asking for learning accommodations.
${ASKS[profile]}
Rules:
- Plain text only. No markdown, no bullet symbols other than a simple "-" list, no subject line.
- 120 to 180 words. Warm, direct and respectful. Everyday words, short sentences.
- Start with "Dear Professor,". Say the student is in the professor's class and would like to talk about accommodations.
- State the needs above as requests, not demands. Offer to send documentation from the disability services office and to meet during office hours.
- Say "I am deaf or hard of hearing" or "I have dyslexia" exactly as the profile says; do not change the wording. Only say thank you once, in the closing.
- Do not invent a name, course, date, diagnosis detail, or anything else about the student.
- End with "Thank you," on one line and then ${NAME_PLACEHOLDER} on the next line. Write ${NAME_PLACEHOLDER} exactly like that.`;

function explain(err: unknown): DraftError {
  if (err instanceof DraftError) return err;
  const status = (err as { status?: number })?.status;
  const detail = err instanceof Error ? err.message : String(err);
  if (err instanceof DeadlineError || (err as Error)?.name === "TimeoutError" || (err as Error)?.name === "AbortError")
    return new DraftError("Writing the draft took too long and was stopped. Try again.", detail);
  if (err instanceof BadOutputError) return new DraftError("The draft came back in a form we couldn’t use. Try again.", detail);
  if (status === 429) return new DraftError("The drafting service is busy or over its quota. Wait a minute, then try again.", detail);
  if (status === 401 || status === 403)
    return new DraftError("The drafting service rejected our API key. This is a setup problem on our side.", detail);
  if (status && status >= 500) return new DraftError("The drafting service had a temporary problem. Try again in a moment.", detail);
  return new DraftError("Writing the draft failed unexpectedly. Try again.", detail);
}

/** Drafts the email body for a profile. Nothing about the lecture or student goes to the model. */
export async function generateAccommodationDraft(profile: DisabilityProfile): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new DraftError("Drafting isn’t set up yet: the server has no API key.");
  const ai = new GoogleGenAI({ apiKey });
  try {
    return await generateWithFallback(ai, {
      contents: "Write the email.",
      config: { systemInstruction: INSTRUCTION(profile), temperature: 0.5, maxOutputTokens: 8192 },
      parse: (response) => {
        if (response.candidates?.[0]?.finishReason === "MAX_TOKENS") throw new BadOutputError("cut off at the token limit");
        const text = (response.text ?? "").replace(/\r\n?/g, "\n").trim();
        if (text.length < MIN_BODY || text.length > MAX_BODY) throw new BadOutputError(`unusable length ${text.length}`);
        if (!text.includes(NAME_PLACEHOLDER)) throw new BadOutputError("missing the name placeholder");
        return text;
      },
      deadline: Date.now() + DRAFT_BUDGET_MS,
      log: "accommodation-draft",
    });
  } catch (err) {
    throw explain(err);
  }
}
