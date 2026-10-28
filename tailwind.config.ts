import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 50: "#f6f7f9", 100: "#eceef2", 200: "#d5d9e1", 300: "#aeb5c4", 400: "#7d869b", 500: "#586177", 600: "#434b5f", 700: "#363d4e", 800: "#262c3a", 900: "#171b26" },
        brand: { 50: "#eefaf6", 100: "#d4f3e8", 500: "#1f9d78", 600: "#178263", 700: "#136a52" },
      },
    },
  },
  plugins: [],
};

export default config;
