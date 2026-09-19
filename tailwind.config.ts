import type { Config } from "tailwindcss";

// Spacing and radius are locked to the Warm Clarity scale:
// p-1..p-7 = 4/8/16/24/32/48/64px. No arbitrary values.
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      primary: { DEFAULT: "var(--color-primary)", dark: "var(--color-primary-dark)" },
      ink: "var(--color-ink)",
      background: "var(--color-background)",
      surface: "var(--color-surface)",
      border: "var(--color-border)",
      accent: "var(--color-accent)",
      success: "var(--color-success)",
      error: "var(--color-error)",
    },
    spacing: {
      0: "0px",
      px: "1px",
      1: "var(--space-1)",
      2: "var(--space-2)",
      3: "var(--space-3)",
      4: "var(--space-4)",
      5: "var(--space-5)",
      6: "var(--space-6)",
      7: "var(--space-7)",
    },
    // Sizes only, no baked-in line heights: body text and captions inherit --body-line-height,
    // so dyslexia mode's looser spacing reaches them. Headings get theirs from globals.css.
    fontSize: {
      sm: "0.875rem",
      base: "1rem",
      lg: "1.125rem",
      xl: "1.375rem",
      "2xl": "1.75rem",
      "3xl": "2.25rem",
      "4xl": "2.75rem",
      "5xl": "3.5rem",
    },
    borderRadius: {
      none: "0px",
      sm: "var(--radius-sm)",
      md: "var(--radius-md)",
      lg: "var(--radius-lg)",
      full: "9999px",
    },
    extend: {
      fontFamily: {
        heading: ["var(--font-heading)"],
        body: ["var(--font-body)"],
      },
      maxWidth: {
        prose: "68ch",
      },
    },
  },
  plugins: [],
};
export default config;
