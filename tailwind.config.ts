import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
      },
      colors: {
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
