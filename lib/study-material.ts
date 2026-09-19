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

/**
 * A lecture's ideas as text: themes hold concepts, and each concept lists how it relates to others.
 * A relation reads as a sentence, "<concept name> <verb> <target name>", built by relationSentence().
 * Optional on DeafHohMaterial so material saved before concept maps existed still parses.
 */
export type Concept = {
  /** Short slug, unique in the map. Relations and in-page links point at it. */
  id: string;
  name: string;
  explanation: string;
  relations: { verb: string; to: string }[];
};
export type ConceptMap = { themes: { name: string; concepts: Concept[] }[] };

export const relationSentence = (from: Concept, verb: string, to: Concept) => `${from.name} ${verb} ${to.name}.`;

export type DeafHohMaterial = {
  version: 1;
  profile: "deaf_hoh";
  /** Each paragraph is a list of short caption lines. */
  sections: { heading: string; paragraphs: string[][] }[];
  glossary: { term: string; definition: string }[];
  /** `cue` says how the speaker signalled it, e.g. "said it would be on the exam". */
  emphasised: { point: string; cue: string }[];
  concept_map?: ConceptMap;
  /** Set when the concept map could not be made (service busy or out of quota). The captions are still complete. */
  concept_map_unavailable?: true;
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

// The concept map is its own model call with its own schema. Gemini rejects (400) a schema whose
// nested list limits multiply past a small budget: 30 concepts x 5 relations was refused, and adding
// these lists to DEAF_HOH_SCHEMA was refused too. So it is kept flat, the relation limit lives in
// the prompt and in parseConceptMap, and themes are grouped by code.
const concept = object({
  id: string("A short unique lowercase slug for this concept, such as photosynthesis or cell-wall. Letters, digits and hyphens only."),
  theme: string("The theme this concept belongs to, up to 6 words. Use the exact same wording for every concept in a theme."),
  name: string("The concept's name as the lecturer used it, up to 6 words."),
  explanation: string("One or two plain sentences on what it is, drawn from the lecture."),
  relations: {
    type: "array",
    description: "At most 5 relations to other concepts. Empty if none.",
    items: object({
      verb: string("A short active verb phrase, up to 4 words, that completes the sentence: this concept, then the verb, then the target. For example: produces, is part of, depends on, is an example of, causes."),
      to: string("The id of the other concept this one is related to. Must be an id used elsewhere in this list."),
    }),
  },
});

export const CONCEPT_MAP_SCHEMA = object({ concepts: list(concept, 2, 30) });

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

const CONCEPT_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_CONCEPTS = 30;

/** Checks a saved concept map: unique ids, relations that point at real concepts, no self-links. */
export function parseConceptMap(v: unknown, path = "concept_map"): ConceptMap {
  const o = record(v, path);
  const themes = array(o.themes, `${path}.themes`, 1, 12).map((t, i) => {
    const r = record(t, `${path}.themes[${i}]`);
    return {
      name: text(r.name, `${path}.themes[${i}].name`, 80),
      concepts: array(r.concepts, `${path}.themes[${i}].concepts`, 1, MAX_CONCEPTS).map((c, j) =>
        parseConcept(c, `${path}.themes[${i}].concepts[${j}]`)
      ),
    };
  });
  checkLinks(themes.flatMap((t) => t.concepts), path);
  return { themes };
}

function parseConcept(c: unknown, p: string): Concept {
  const cr = record(c, p);
  const id = text(cr.id, `${p}.id`, 40).toLowerCase();
  if (!CONCEPT_ID.test(id)) fail(`${p}.id`, "must use lowercase letters, digits and hyphens only");
  return {
    id,
    name: text(cr.name, `${p}.name`, 80),
    explanation: text(cr.explanation, `${p}.explanation`, 500),
    relations: array(cr.relations, `${p}.relations`, 0, 5).map((x, k) => {
      const rr = record(x, `${p}.relations[${k}]`);
      const verb = text(rr.verb, `${p}.relations[${k}].verb`, 40);
      if (/[.!?;:]$/.test(verb)) fail(`${p}.relations[${k}].verb`, "must be a short verb phrase, not a sentence");
      return { verb, to: text(rr.to, `${p}.relations[${k}].to`, 40).toLowerCase() };
    }),
  };
}

function checkLinks(concepts: Concept[], path: string) {
  const ids = new Set<string>();
  for (const c of concepts) {
    if (ids.has(c.id)) fail(path, `concept id "${c.id}" is used twice`);
    ids.add(c.id);
  }
  if (ids.size < 2) fail(path, "needs at least 2 concepts");
  if (ids.size > MAX_CONCEPTS) fail(path, `has more than ${MAX_CONCEPTS} concepts`);
  let relationCount = 0;
  for (const c of concepts) {
    const seen = new Set<string>();
    for (const r of c.relations) {
      if (!ids.has(r.to)) fail(`${path}.${c.id}.relations`, `points at "${r.to}", which is not in the map`);
      if (r.to === c.id) fail(`${path}.${c.id}.relations`, "a concept can't relate to itself");
      if (seen.has(r.to)) fail(`${path}.${c.id}.relations`, `has two relations to "${r.to}"`);
      seen.add(r.to);
      relationCount++;
    }
  }
  if (relationCount === 0) fail(path, "needs at least 1 relation");
}

/** The model's flat list becomes themes, in the order each theme first appears (reading order). */
export function parseConceptMapOutput(v: unknown): ConceptMap {
  const flat = array(record(v, "output").concepts, "concepts", 2, MAX_CONCEPTS).map((c, i) => {
    const theme = text(record(c, `concepts[${i}]`).theme, `concepts[${i}].theme`, 80);
    return { theme, concept: parseConcept(c, `concepts[${i}]`) };
  });
  checkLinks(flat.map((f) => f.concept), "concepts");
  const themes: ConceptMap["themes"] = [];
  for (const { theme, concept } of flat) {
    const key = theme.toLowerCase();
    const existing = themes.find((t) => t.name.toLowerCase() === key);
    if (existing) existing.concepts.push(concept);
    else themes.push({ name: theme, concepts: [concept] });
  }
  return { themes };
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
    // Rows saved before concept maps existed have no map; that is still valid.
    ...(o.concept_map === undefined ? {} : { concept_map: parseConceptMap(o.concept_map) }),
    ...(o.concept_map_unavailable === true ? { concept_map_unavailable: true as const } : {}),
    glossary: terms(o.glossary, "glossary", 30),
    emphasised: array(o.emphasised, "emphasised", 0, 15).map((e, i) => {
      const r = record(e, `emphasised[${i}]`);
      return { point: text(r.point, `emphasised[${i}].point`, 400), cue: text(r.cue, `emphasised[${i}].cue`, 400) };
    }),
  };
}
