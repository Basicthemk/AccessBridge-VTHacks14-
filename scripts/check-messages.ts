// Checks every language file against English: same keys, same {placeholders} and <tags>, and that each
// message is valid ICU syntax. Run before shipping a translation change:
//   npx tsx scripts/check-messages.ts
import { readFileSync } from "node:fs";
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
console.log(problems ? `${problems} problem(s)` : `ok: ${LOCALES.length} languages, ${Object.keys(en).length} messages each`);
process.exit(problems ? 1 : 0);
