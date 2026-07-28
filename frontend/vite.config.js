import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Netlify serves from the domain root, so no base path override needed.
  // (If you ever also deploy to GitHub Pages, that needs base: "/repo-name/".)
});
