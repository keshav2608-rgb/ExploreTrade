import type { Config } from "tailwindcss";

/**
 * Design tokens for a calm, light fintech dashboard (SRS §8.1).
 * Gains are green, losses are red, and every coloured value is also
 * labelled with a sign so meaning is never colour-only.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#dbe6fe",
          500: "#3b6fe3",
          600: "#2f5bc4",
          700: "#27499e",
        },
        gain: { DEFAULT: "#15803d", soft: "#dcfce7" },
        loss: { DEFAULT: "#b91c1c", soft: "#fee2e2" },
        ink: { DEFAULT: "#1f2937", muted: "#6b7280", faint: "#9ca3af" },
        line: "#e5e7eb",
        canvas: "#f7f8fa",
      },
      borderRadius: { card: "0.875rem" },
      boxShadow: { card: "0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)" },
      fontFamily: { sans: ["var(--font-sans)", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};

export default config;
