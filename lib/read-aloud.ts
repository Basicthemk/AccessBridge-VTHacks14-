// Pure helpers shared by the read-aloud route and the player. No server-only imports.
import type { DyslexiaMaterial } from "./study-material";

export const READ_ALOUD_SECTIONS = ["summary", "terms", "outline"] as const;
export type ReadAloudSection = (typeof READ_ALOUD_SECTIONS)[number];

export const isSection = (v: unknown): v is ReadAloudSection =>
  typeof v === "string" && (READ_ALOUD_SECTIONS as readonly string[]).includes(v);

/** Whole JSON request to the read-aloud route: just {"section":"summary"}. */
export const MAX_REQUEST_BYTES = 256;
/** One section in one request. Flash v2.5 allows 40,000; this keeps a single click affordable. */
export const MAX_SECTION_CHARS = 20_000;

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
