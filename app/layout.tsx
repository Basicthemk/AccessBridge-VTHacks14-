import type { Metadata } from "next";
import { Fraunces, Atkinson_Hyperlegible } from "next/font/google";
import "@fontsource/opendyslexic/latin-400.css";
import "@fontsource/opendyslexic/latin-700.css";
import "./globals.css";

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
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${fraunces.variable} ${atkinson.variable}`}>
      <body className="min-h-screen font-body antialiased">{children}</body>
    </html>
  );
}
