import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Trade Finder style matte dark mode
        brand: {
          bg: '#030712',      // Deepest gray/black for main background
          surface: '#111827', // Raised surface for cards and sidebar
          border: '#1f2937',  // Subtle borders
          muted: '#9ca3af',   // Secondary text
          bull: '#10b981',    // Crisp Emerald Green
          bullBg: 'rgba(16, 185, 129, 0.1)',
          bear: '#ef4444',    // Crisp Red
          bearBg: 'rgba(239, 68, 68, 0.1)',
          accent: '#3b82f6',  // Blue for active states/links
        }
      }
    },
  },
  plugins: [],
};
export default config;
