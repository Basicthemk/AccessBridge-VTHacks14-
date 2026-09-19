import { useTranslations } from "next-intl";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export default function AuthShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Auth");
  return (
    <main id="main" tabIndex={-1} className="mx-auto grid min-h-screen max-w-6xl content-start gap-5 px-3 py-6 md:grid-cols-12 md:gap-x-6 md:gap-y-5 md:px-5 md:py-7">
      <section aria-labelledby="pitch" className="md:col-span-7 md:row-start-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/lockup-transparent.svg" alt="AccessBridge" width={1040} height={220} className="h-7 w-auto max-w-full" />
          <LanguageSwitcher />
        </div>
        <h1 id="pitch" className="mt-5 max-w-prose text-4xl font-semibold text-balance md:text-5xl">
          {t("pitchHeading")}
        </h1>
        <p className="mt-4 max-w-prose text-lg">
          {t("pitchBody")}
        </p>
      </section>

      <section className="sheet md:col-span-5 md:col-start-8 md:row-span-2 md:row-start-1 md:mt-6 md:self-start">
        {children}
      </section>

      {/* After the form on a phone, so the task comes first; under the pitch on a wide screen. */}
      <div className="md:col-span-7 md:col-start-1 md:row-start-2 md:self-start">
        <figure className="max-w-prose border-t border-border pt-4">
          <figcaption className="font-heading text-xl font-semibold">{t("figcaption")}</figcaption>
          <ul aria-label={t("listLabel")} className="mt-3 list-disc space-y-2 pl-4">
            <li>{t("dense1")}</li>
            <li>{t("dense2")}</li>
            <li>{t("dense3")}</li>
          </ul>
        </figure>
      </div>
    </main>
  );
}
