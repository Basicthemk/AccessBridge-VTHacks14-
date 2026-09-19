import type { DisabilityProfile } from "./profiles";

/**
 * The JSON saved in generated_content.content_json. `version` lets us change
 * the shape later without breaking rows already saved.
 */
export type DyslexiaMaterial = {
  version: 1;
  profile: "dyslexia";
  summary_chunks: { heading: string; text: string }[];
  key_terms: { term: string; definition: string }[];
  outline: { text: string; children: string[] }[];
};

export type DeafHohMaterial = {
  version: 1;
  profile: "deaf_hoh";
  /** Each paragraph is a list of short caption lines. */
  sections: { heading: string; paragraphs: string[][] }[];
  glossary: { term: string; definition: string }[];
  /** `cue` says how the speaker signalled it, e.g. "said it would be on the exam". */
  emphasised: { point: string; cue: string }[];
};

export type StudyMaterial = DyslexiaMaterial | DeafHohMaterial;

/** The model's answer for deaf/HoH: sections point at numbered paragraphs; the transcript text is filled in by code. */
export type DeafHohModelOutput = {
  sections: { heading: string; start_paragraph: number }[];
  glossary: DeafHohMaterial["glossary"];
  emphasised: DeafHohMaterial["emphasised"];
};

export class InvalidMaterialError extends Error {}

// ---------- JSON schemas sent to Gemini (responseJsonSchema) ----------

const string = (description: string) => ({ type: "string", description });
const list = (items: unknown, min: number, max: number) => ({ type: "array", items, minItems: min, maxItems: max });
const object = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  propertyOrdering: Object.keys(properties),
});

const term = object({
  term: string("The term as the lecturer used it."),
  definition: string("A plain definition in one sentence."),
});

export const DYSLEXIA_SCHEMA = object({
  summary_chunks: list(
    object({
      heading: string("Up to 8 words."),
      text: string("Two or three short sentences, under 60 words in total."),
    }),
    2,
    30
  ),
  key_terms: list(term, 0, 25),
  outline: list(
    object({
      text: string("One point, under 15 words."),
      children: list(string("A supporting point, under 15 words."), 0, 5),
    }),
    2,
    20
  ),
});

export const DEAF_HOH_SCHEMA = object({
  sections: list(
    object({
      heading: string("A short descriptive heading, up to 8 words."),
      start_paragraph: { type: "integer", description: "Number of the first paragraph in this section." },
    }),
    1,
    40
  ),
  glossary: list(term, 0, 30),
  emphasised: list(
    object({
      point: string("The point that was emphasised, in one sentence."),
      cue: string("How the speaker signalled it, quoting or paraphrasing the transcript."),
    }),
    0,
    15
  ),
});

// ---------- validation ----------

function fail(path: string, why: string): never {
  throw new InvalidMaterialError(`${path}: ${why}`);
}

function text(v: unknown, path: string, max: number): string {
  if (typeof v !== "string") fail(path, "expected a string");
  const s = v.trim();
  if (!s) fail(path, "is empty");
  if (s.length > max) fail(path, `is longer than ${max} characters`);
  return s;
}

function array(v: unknown, path: string, min: number, max: number): unknown[] {
  if (!Array.isArray(v)) fail(path, "expected a list");
  if (v.length < min) fail(path, `needs at least ${min} items`);
  if (v.length > max) fail(path, `has more than ${max} items`);
  return v;
}

function record(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) fail(path, "expected an object");
  return v as Record<string, unknown>;
}

function terms(v: unknown, path: string, max: number) {
  return array(v, path, 0, max).map((t, i) => {
    const o = record(t, `${path}[${i}]`);
    return { term: text(o.term, `${path}[${i}].term`, 80), definition: text(o.definition, `${path}[${i}].definition`, 400) };
  });
}

export function parseDyslexiaOutput(v: unknown): Omit<DyslexiaMaterial, "version" | "profile"> {
  const o = record(v, "output");
  return {
    summary_chunks: array(o.summary_chunks, "summary_chunks", 2, 30).map((c, i) => {
      const r = record(c, `summary_chunks[${i}]`);
      return { heading: text(r.heading, `summary_chunks[${i}].heading`, 100), text: text(r.text, `summary_chunks[${i}].text`, 600) };
    }),
    key_terms: terms(o.key_terms, "key_terms", 25),
    outline: array(o.outline, "outline", 2, 20).map((p, i) => {
      const r = record(p, `outline[${i}]`);
      return {
        text: text(r.text, `outline[${i}].text`, 200),
        children: array(r.children, `outline[${i}].children`, 0, 5).map((c, j) => text(c, `outline[${i}].children[${j}]`, 200)),
      };
    }),
  };
}

export function parseDeafHohOutput(v: unknown, paragraphCount: number): DeafHohModelOutput {
  const o = record(v, "output");
  const sections = array(o.sections, "sections", 1, 40).map((s, i) => {
    const r = record(s, `sections[${i}]`);
    const start = r.start_paragraph;
    if (typeof start !== "number" || !Number.isInteger(start) || start < 1 || start > paragraphCount)
      fail(`sections[${i}].start_paragraph`, `must be a paragraph number from 1 to ${paragraphCount}`);
    return { heading: text(r.heading, `sections[${i}].heading`, 100), start_paragraph: start };
  });
  for (let i = 1; i < sections.length; i++) {
    if (sections[i].start_paragraph <= sections[i - 1].start_paragraph)
      fail(`sections[${i}].start_paragraph`, "sections must be in increasing paragraph order");
  }
  return {
    sections,
    glossary: terms(o.glossary, "glossary", 30),
    emphasised: array(o.emphasised, "emphasised", 0, 15).map((e, i) => {
      const r = record(e, `emphasised[${i}]`);
      return { point: text(r.point, `emphasised[${i}].point`, 400), cue: text(r.cue, `emphasised[${i}].cue`, 400) };
    }),
  };
}

/** Validates a saved content_json row (or a freshly built one) against the shape for `profile`. */
export function parseStudyMaterial(profile: DisabilityProfile, v: unknown): StudyMaterial {
  const o = record(v, "content");
  if (o.version !== 1) fail("version", "unknown version");
  if (o.profile !== profile) fail("profile", `expected ${profile}`);
  if (profile === "dyslexia") {
    return { version: 1, profile, ...parseDyslexiaOutput(o) };
  }
  const sections = array(o.sections, "sections", 1, 40).map((s, i) => {
    const r = record(s, `sections[${i}]`);
    return {
      heading: text(r.heading, `sections[${i}].heading`, 100),
      paragraphs: array(r.paragraphs, `sections[${i}].paragraphs`, 1, 2000).map((p, j) =>
        array(p, `sections[${i}].paragraphs[${j}]`, 1, 2000).map((l, k) => text(l, `sections[${i}].paragraphs[${j}][${k}]`, 2000))
      ),
    };
  });
  return {
    version: 1,
    profile,
    sections,
    glossary: terms(o.glossary, "glossary", 30),
    emphasised: array(o.emphasised, "emphasised", 0, 15).map((e, i) => {
      const r = record(e, `emphasised[${i}]`);
      return { point: text(r.point, `emphasised[${i}].point`, 400), cue: text(r.cue, `emphasised[${i}].cue`, 400) };
    }),
  };
}
