import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import en from "@/messages/en.json";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "@/i18n/config";

/** The language the student chose, read from the cookie the language switcher sets. */
export function requestLocale(): Locale {
  const value = cookies().get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Translator for the messages the server sends back (route errors, saved error text). */
export function serverT() {
  return getTranslations({ locale: requestLocale(), namespace: "Server" });
}
export type ServerT = Awaited<ReturnType<typeof serverT>>;

// The English text of every fixed server message, so an error written in English (by the code that
// raised it, or saved in the database by an earlier request) can be shown in the reader's language.
// Messages that take a value ({max}, {name}) are not fixed text, so they are left out.
const CODE_BY_TEXT = new Map(Object.entries(en.Server).filter(([, text]) => !text.includes("{")).map(([code, text]) => [text, code]));

/** The message in the reader's language if it is one we know, otherwise as it was written. */
export function localize(t: ServerT, message: string): string {
  const code = CODE_BY_TEXT.get(message);
  return code ? t(code as never) : message;
}

/** The message for a failed input check: in the reader's language when the check names its message. */
export function checkText(t: ServerT, result: { message: string; code?: string; params?: Record<string, string | number> }): string {
  return result.code ? t(result.code as never, result.params as never) : result.message;
}

/** A transcript or study-material state whose failure text (possibly saved in English earlier) is shown in the reader's language. */
export function localizeState<S extends { kind: string }>(t: ServerT, state: S): S {
  return "message" in state && typeof (state as { message?: unknown }).message === "string"
    ? { ...state, message: localize(t, (state as unknown as { message: string }).message) }
    : state;
}
