import type { ContentListUnion, GenerateContentConfig, GenerateContentResponse, GoogleGenAI } from "@google/genai";

// Newer models are often overloaded (503), so try the preferred one first, then older ones. Each
// model has its own daily quota, so the Lite model at the end keeps working after the others run out.
export const MODELS = [process.env.GEMINI_MODEL || "gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"];
/** For work where the Lite model's quality isn't good enough, such as linking ideas in a concept map. */
export const MODELS_WITHOUT_LITE = MODELS.filter((m) => !/lite/i.test(m));
const TRANSIENT = new Set([429, 500, 503, 504]);
const RETRY_DELAY_MS = 5000;
const MIN_ATTEMPT_MS = 20_000;

/**
 * A 429 that means the model's quota for the day is used up, not a brief spike. Retrying it
 * only spends more of the quota, so the caller moves on to the next model straight away.
 */
export function isDailyQuota(err: unknown): boolean {
  if ((err as { status?: number })?.status !== 429) return false;
  const message = err instanceof Error ? err.message : "";
  return /exceeded your current quota/i.test(message) && !/PerMinute/i.test(message);
}

/** Thrown by a `parse` callback when the model's answer is unusable; the call is retried, then the next model is tried. */
export class BadOutputError extends Error {}

/** Thrown when the caller's deadline leaves too little time for another attempt. */
export class DeadlineError extends Error {
  constructor() {
    super("deadline reached before a model answered");
  }
}

/**
 * Calls Gemini with retries and model fallback, and returns `parse(response)`.
 * Transient errors (429/5xx) get one retry per model, then the next model is used.
 * A `deadline` (epoch ms) stops new attempts and aborts one that runs past it.
 */
export async function generateWithFallback<T>(
  ai: GoogleGenAI,
  opts: {
    contents: ContentListUnion;
    config: GenerateContentConfig;
    parse: (response: GenerateContentResponse) => T;
    deadline?: number;
    log?: string;
    /** Models to try, in order. Defaults to all of MODELS. */
    models?: string[];
  }
): Promise<T> {
  const tag = opts.log ?? "gemini";
  let last: unknown;
  for (const model of opts.models ?? MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = opts.deadline ? opts.deadline - Date.now() : Infinity;
      if (remaining < MIN_ATTEMPT_MS) throw last instanceof Error && !(last instanceof BadOutputError) ? last : new DeadlineError();
      try {
        const response = await ai.models.generateContent({
          model,
          contents: opts.contents,
          config: {
            ...opts.config,
            ...(opts.deadline ? { abortSignal: AbortSignal.timeout(remaining) } : {}),
          },
        });
        return opts.parse(response);
      } catch (err) {
        last = err;
        if (err instanceof BadOutputError) {
          console.warn(`${tag}: unusable output from`, model, err.message);
          continue;
        }
        const status = (err as { status?: number })?.status;
        if (status === 404) break; // model retired for this key: go to the next one
        if (isDailyQuota(err)) {
          console.warn(`${tag}: daily quota used up on`, model);
          break;
        }
        if (!status || !TRANSIENT.has(status)) throw err;
        console.warn(`${tag}: transient`, status, "from", model);
        if (attempt === 0) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }
  throw last;
}
