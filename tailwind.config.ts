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
