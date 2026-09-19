// Checks every language file against English: same keys, same {placeholders} and <tags>, and that each
// message is valid ICU syntax. Run before shipping a translation change:
//   npx tsx scripts/check-messages.ts
import { readFileSync, readdirSync } from "node:fs";
import { IntlMessageFormat } from "intl-messageformat";
import { LOCALES } from "../i18n/config";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else Object.assign(out, flatten(v, key));
  }
  return out;
}

const load = (l: string) => flatten(JSON.parse(readFileSync(new URL(`../messages/${l}.json`, import.meta.url), "utf8")) as Tree);
// The names of the {placeholders} and <tags> in a message, ignoring ICU plural/select branches' own text.
const tokens = (m: string) => {
  const found = new Set<string>();
  m.replace(/\{\s*([A-Za-z_]+)/g, (_all, name: string) => (found.add(`{${name}}`), ""));
  m.replace(/<(\/?[a-z]+)>/g, (_all, name: string) => (found.add(`<${name}>`), ""));
  return Array.from(found).sort().join(" ");
};

const en = load("en");
let problems = 0;
for (const locale of LOCALES) {
  const msgs = load(locale);
  for (const key of Object.keys(en)) {
    if (!(key in msgs)) {
      console.log(`${locale}: MISSING ${key}`);
      problems++;
      continue;
    }
    if (locale !== "en" && msgs[key] === en[key] && !/^(MP3|Status|En)/.test(en[key]) && en[key].length > 3)
      console.log(`${locale}: same as English (check it is meant to be): ${key}`);
    try {
      new IntlMessageFormat(msgs[key], locale);
    } catch (e) {
      console.log(`${locale}: BAD ICU in ${key}: ${(e as Error).message}`);
      problems++;
    }
    if (tokens(msgs[key]) !== tokens(en[key])) {
      console.log(`${locale}: placeholders differ in ${key}: "${tokens(msgs[key])}" vs English "${tokens(en[key])}"`);
      problems++;
    }
  }
  for (const key of Object.keys(msgs)) if (!(key in en)) (console.log(`${locale}: EXTRA ${key}`), problems++);
  if (/'/.test(JSON.stringify(msgs))) console.log(`${locale}: contains a straight apostrophe (an ICU escape); use ’`);
}
// Every fixed English message the code can raise or save must have a Server translation, or it stays
// English on screen. Only messages written as plain "quoted sentences" are seen here.
const known = new Set(Object.entries(en).filter(([k, v]) => k.startsWith("Server.") && !v.includes("{")).map(([, v]) => v));
const sources = [
  "lib/lecture-chat.ts", "lib/site-chat.ts", "lib/accommodation-draft.ts", "lib/generate-study-material.ts", "lib/elevenlabs.ts",
  "lib/send-email.ts", "lib/transcribe.ts", "lib/generation-status.ts", "lib/transcript-status.ts", "app/lectures/[id]/page.tsx",
  ...readdirSync("app/api", { recursive: true }).map(String).filter((f) => f.endsWith("route.ts")).map((f) => `app/api/${f}`),
];
let untranslated = 0;
for (const file of sources) {
  const src = readFileSync(file, "utf8");
  src.replace(/(?:Error\(\s*|message: |\? |: )"([A-Z][^"]{25,}[.])"/g, (_all, text: string) => {
    if (!known.has(text)) (console.log(`${file}: no Server translation for "${text.slice(0, 80)}"`), untranslated++);
    return "";
  });
}
problems += untranslated;
console.log(problems ? `${problems} problem(s)` : `ok: ${LOCALES.length} languages, ${Object.keys(en).length} messages each`);
process.exit(problems ? 1 : 0);
