import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/constants/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        'nexus-bg': '#f3f4f6',
        'nexus-green': '#d1e2d1',
        'nexus-text': '#2d4d2d',
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(31, 38, 135, 0.15)',
        'skeuo-flat': '8px 8px 16px #d1d9e6, -8px -8px 16px #ffffff',
        'skeuo-pressed': 'inset 6px 6px 12px #bebebe, inset -6px -6px 12px #ffffff',
      },
    },
  },
  plugins: [],
};
export default config;