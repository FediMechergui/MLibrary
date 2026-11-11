import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import {
  cpSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";
// PDF scans need the decoder binaries even when the device is offline.
for (const directory of ["wasm", "standard_fonts", "cmaps"]) {
  const destination = resolve("public/pdfjs", directory);
  mkdirSync(destination, { recursive: true });
  cpSync(resolve("node_modules/pdfjs-dist", directory), destination, {
    recursive: true,
  });
}
mkdirSync(resolve("public/ocr/core"), { recursive: true });
mkdirSync(resolve("public/ocr/lang"), { recursive: true });
copyFileSync(
  resolve("node_modules/tesseract.js/dist/worker.min.js"),
  resolve("public/ocr/worker.min.js"),
);
for (const file of readdirSync(
  resolve("node_modules/tesseract.js-core"),
).filter((name) => /-lstm\.wasm(?:\.js)?$/.test(name)))
  copyFileSync(
    resolve("node_modules/tesseract.js-core", file),
    resolve("public/ocr/core", file),
  );
for (const language of ["eng", "fra", "ara"]) {
  // Android's asset packager expands .gz assets and strips their extension.
  // Serve identical uncompressed names on web and native to avoid 404s.
  writeFileSync(
    resolve(`public/ocr/lang/${language}.traineddata`),
    gunzipSync(
      readFileSync(
        resolve(
          `node_modules/@tesseract.js-data/${language}/4.0.0_best_int/${language}.traineddata.gz`,
        ),
      ),
    ),
  );
  const legacy = resolve(`public/ocr/lang/${language}.traineddata.gz`);
  if (existsSync(legacy)) unlinkSync(legacy);
}
export default defineConfig({
  plugins: [
    react(),
    ...(process.env.MLIBRARY_NATIVE_BUILD === "1"
      ? [
          {
            name: "native-public-assets",
            closeBundle() {
              const collection = resolve("public/data/gallica");
              cpSync(resolve("public"), resolve("dist"), {
                recursive: true,
                filter: (source) =>
                  source !== collection &&
                  !source.startsWith(collection + "/") &&
                  !source.startsWith(collection + "\\"),
              });
            },
          },
        ]
      : []),
  ],
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
  // Gallica texts are served on demand by the backend. Do not put the entire
  // public collection into every Android installation.
  build: {
    chunkSizeWarningLimit: 900,
    copyPublicDir: process.env.MLIBRARY_NATIVE_BUILD !== "1",
  },
});
