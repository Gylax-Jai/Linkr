import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

/** Monorepo root — same `.env` as the server (see server/src/config/env.ts). */
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  envDir: repoRoot,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
      },
      manifest: {
        name: "Linkr",
        short_name: "Linkr",
        description: "Connect privately. Talk freely.",
        theme_color: "#7C5CFC",
        background_color: "#0f0f14",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/linkr.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "/favicon.svg",
            sizes: "64x64",
            type: "image/svg+xml",
            purpose: "maskable",
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
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
