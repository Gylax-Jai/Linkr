import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Monorepo root — same `.env` as the server (see server/src/config/env.ts). */
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  envDir: repoRoot,
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
