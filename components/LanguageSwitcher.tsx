"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { LOCALES, LOCALE_COOKIE, LOCALE_NAMES, LOCALE_STORAGE_KEY, isLocale, type Locale } from "@/i18n/config";

const ONE_YEAR = 60 * 60 * 24 * 365;

function remember(locale: Locale) {
  // The cookie lets the server draw the right language on the first paint; localStorage is the
  // durable copy, like the dyslexia toggle, and restores the cookie if it was cleared.
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Storage can be blocked. The cookie still keeps the choice.
  }
}

// A native <select> with a visible text label: it is keyboard operable and announced properly
// everywhere for free, and each option is written in its own language (and marked with it).
export default function LanguageSwitcher() {
  const current = useLocale() as Locale;
  const t = useTranslations("Language");
  const router = useRouter();
  const [announcement, setAnnouncement] = useState("");

  // A saved choice wins over the cookie, so clearing cookies alone doesn't lose it.
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    } catch {
      // Blocked storage: the cookie decides.
    }
    if (isLocale(saved) && saved !== current) {
      remember(saved);
      router.refresh();
    }
    // Runs once per page load on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The page is redrawn in the new language a moment after the choice, so the spoken confirmation
  // waits for that and is said in the language just chosen.
  const [pending, setPending] = useState<Locale | null>(null);
  useEffect(() => {
    if (pending && pending === current) {
      setAnnouncement(t("changed", { language: LOCALE_NAMES[current] }));
      setPending(null);
    }
  }, [pending, current, t]);

  function change(next: Locale) {
    if (next === current) return;
    remember(next);
    document.documentElement.lang = next;
    setPending(next);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="language-select" className="font-bold">{t("label")}</label>
      <select
        id="language-select"
        value={current}
        onChange={(e) => isLocale(e.target.value) && change(e.target.value)}
        className="rounded-md border-2 border-accent bg-surface px-2 py-1 text-ink"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
      <span role="status" className="sr-only">{announcement}</span>
    </div>
  );
}
