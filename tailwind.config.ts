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
        nutrafi: {
          primary: "#728d53",
          "primary-alt": "#718d55",
          dark: "#4f6849",
          light: "#9eb664",
        },
      },
    },
  },
  plugins: [],
};

export default config;

