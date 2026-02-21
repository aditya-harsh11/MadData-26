import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#0a0a0f",
          50: "#13131a",
          100: "#1a1a25",
          200: "#1e1e2e",
          300: "#252535",
        },
        accent: {
          cyan: "#22d3ee",
          amber: "#f59e0b",
          purple: "#a855f7",
          emerald: "#10b981",
          blue: "#3b82f6",
          pink: "#ec4899",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
