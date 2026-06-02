/**
 * Tailwind CSS v4 se integra como plugin de PostCSS.
 * La configuración de tema vive en el CSS (app/globals.css), no en un config JS (v4 CSS-first).
 */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
