const config = {
  plugins: {
    // Standard Tailwind setup for Next.js. Unlike the @tailwindcss/turbopack
    // loader, it rebuilds when the CSS content changes, not only its mtime,
    // so `next dev` never serves an outdated globals.css
    "@tailwindcss/postcss": {},
  },
};

export default config;
