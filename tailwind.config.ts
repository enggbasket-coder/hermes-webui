import type { Config } from "tailwindcss";
export default {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: "#0b0d10", elev: "#13161b", card: "#171b21" },
        line: "#262b33",
        ink: { DEFAULT: "#e6e8ec", dim: "#9aa3b2", faint: "#6b7280" },
        accent: { DEFAULT: "#7c9cff", hover: "#90acff" },
        ok: "#3ec28f",
        warn: "#e0b341",
        err: "#e06b6b",
      },
      fontFamily: { mono: ["ui-monospace", "SFMono-Regular", "monospace"] },
    },
  },
  plugins: [],
} satisfies Config;
