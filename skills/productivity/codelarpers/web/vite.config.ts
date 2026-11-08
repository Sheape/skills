import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// `pnpm dev` proxies the API to a running `codelarper serve` (CODELARPER_PORT, default 7357).
const port = process.env.CODELARPER_PORT || "7357";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  server: { proxy: { "/api": `http://127.0.0.1:${port}` } },
  build: { outDir: "dist", assetsDir: "assets", chunkSizeWarningLimit: 1500 },
});
