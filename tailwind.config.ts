import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["selector", "[data-theme=\"dark\"]"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        // JBS design-system: JetBrains Mono for tags / badges / code (2026-05-11)
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      colors: {
        // JBS design-system palette (mirrors the CSS variables in globals.css).
        // Available as Tailwind utilities — text-jbs-cyan / bg-jbs-cyan / etc.
        // Only meaningful in dark mode; light mode keeps the brand-* scale.
        "jbs-cyan":   "#00f2ff",
        "jbs-red":    "#ff5f56",
        "jbs-yellow": "#ffbd2e",
        "jbs-green":  "#27c93f",
        "jbs-bg":     "#050505",
        // iCareerOS brand palette — matches landing page CSS vars
        // Primary: #00d9ff (cyan)
        brand: {
          50:  "#e5fbff",
          100: "#b3f4ff",
          200: "#80eeff",
          300: "#4de7ff",
          400: "#1ae1ff",
          500: "#00d9ff",   // --primary
          600: "#00a8cc",   // --primary-dark
          700: "#007a99",
          800: "#005c73",
          900: "#003d4d",
        },
      },
    },
  },
  plugins: [],
};

export default config;
