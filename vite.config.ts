import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cpSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
// PDF scans need the decoder binaries even when the device is offline.
for (const directory of ["wasm", "standard_fonts", "cmaps"]) {
  const destination = resolve("public/pdfjs", directory);
  mkdirSync(destination, { recursive: true });
  cpSync(resolve("node_modules/pdfjs-dist", directory), destination, {
    recursive: true,
  });
}
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    watch: {
      ignored: [
        "**/android/**",
        "**/.cache/**",
        "**/artifacts/**",
        "**/test-results/**",
      ],
    },
    proxy: { "/api": "http://127.0.0.1:8889" },
  },
  build: { chunkSizeWarningLimit: 900 },
});
