// Pure helpers shared by the read-aloud route and the player. No server-only imports.
import type { DyslexiaMaterial } from "./study-material";

export const READ_ALOUD_SECTIONS = ["summary", "terms", "outline"] as const;
export type ReadAloudSection = (typeof READ_ALOUD_SECTIONS)[number];

export const isSection = (v: unknown): v is ReadAloudSection =>
  typeof v === "string" && (READ_ALOUD_SECTIONS as readonly string[]).includes(v);

/** Whole JSON request to the read-aloud route: just {"section":"summary"}. */
export const MAX_REQUEST_BYTES = 256;
/**
 * Spending limits, sized for the ElevenLabs Free plan: 10,000 credits a month, and Flash v2.5
 * costs 0.5 credit per character, so about 20,000 characters for the whole app each month.
 * One student may use a quarter of that per rolling 30 days, and a section longer than the
 * daily limit could never be read, so it is refused up front with a clear message.
 * Raise these together when the plan changes.
 */
export const MAX_CHARS_PER_DAY = 3_000;
export const MAX_CHARS_PER_MONTH = 5_000;
/**
 * Shared cap across every student per rolling 30 days. It sits under the plan's 20,000 so the
 * owner has room for checks, and one student's audio still counts once the files are deleted.
 */
export const MAX_CHARS_ALL_STUDENTS_PER_MONTH = 18_000;
export const MAX_SECTION_CHARS = MAX_CHARS_PER_DAY;

// A full stop after each heading and a blank line between blocks give the voice a natural pause.
const sentence = (s: string) => (/[.!?…]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

/** The exact words that are spoken for one section. The server builds this from the saved material. */
export function sectionText(m: DyslexiaMaterial, section: ReadAloudSection): string {
  switch (section) {
    case "summary":
      return m.summary_chunks.map((c) => `${sentence(c.heading)} ${c.text.trim()}`).join("\n\n");
    case "terms":
      return m.key_terms.map((t) => `${sentence(t.term)} ${t.definition.trim()}`).join("\n\n");
    case "outline":
      return m.outline.map((p) => [sentence(p.text), ...p.children.map(sentence)].join(" ")).join("\n\n");
  }
}
