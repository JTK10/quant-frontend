import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:  ['Sora', 'sans-serif'],
        mono:  ['JetBrains Mono', 'monospace'],
      },
      colors: {
        brand: {
          bg:        '#060a14',
          surface:   '#0d1424',
          surface2:  '#111c30',
          border:    '#1a2840',
          muted:     '#5a7299',
          text:      '#c8d8f0',
          bull:      '#05d98f',
          bullbg:    'rgba(5,217,143,0.07)',
          bear:      '#f0365a',
          bearbg:    'rgba(240,54,90,0.07)',
          accent:    '#4f8ef7',
          accentbg:  'rgba(79,142,247,0.08)',
          gold:      '#f0a500',
        }
      },
    },
  },
  plugins: [],
};
export default config;
