import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // The workspace .env lives at the repo root, and COURSE_NOW is exposed to the
  // client alongside the usual VITE_ prefix so date windows can be anchored.
  envDir: "../..",
  envPrefix: ["VITE_", "COURSE_"],
  server: {
    // The ontology API runs separately (pnpm --filter @jingni/ontology dev).
    // Proxying keeps the browser on one origin, so no CORS setup is needed.
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
