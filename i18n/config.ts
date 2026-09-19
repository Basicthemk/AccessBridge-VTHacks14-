// The languages the interface is offered in. English is the default and the fallback.
export const LOCALES = ["en", "es", "fr", "pt"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** Each language's own name, so a reader can find theirs whatever language the page is in. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  pt: "Português",
};

// The choice is kept in a cookie (so the server renders the right language on the first paint)
// and mirrored to localStorage, the same pattern as the dyslexia toggle.
export const LOCALE_COOKIE = "ab-locale";
export const LOCALE_STORAGE_KEY = "ab-locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}
