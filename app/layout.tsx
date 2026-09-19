import type { Metadata } from "next";
import { Fraunces, Atkinson_Hyperlegible } from "next/font/google";
import "@fontsource/opendyslexic/latin-400.css";
import "@fontsource/opendyslexic/latin-700.css";
import "./globals.css";
import { APPLY_SAVED_SCRIPT } from "@/lib/dyslexia-mode";
import SiteChat from "@/components/SiteChat";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});
const atkinson = Atkinson_Hyperlegible({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-atkinson",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AccessBridge",
  description:
    "Turn a lecture recording into study material that fits how you learn, and handle the accommodation paperwork too.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-64.png", sizes: "64x64", type: "image/png" },
    ],
    apple: { url: "/icon-180.png", sizes: "180x180", type: "image/png" },
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const t = await getTranslations("Layout");
  return (
    // suppressHydrationWarning: the head script sets data-dyslexia before React hydrates.
    <html lang={locale} className={`${fraunces.variable} ${atkinson.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPLY_SAVED_SCRIPT }} />
      </head>
      <body className="min-h-screen font-body antialiased">
        <NextIntlClientProvider>
          <a href="#main" className="skip-link">{t("skip")}</a>
          {children}
          <SiteChat />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
