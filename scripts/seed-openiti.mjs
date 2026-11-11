import { readFile, writeFile } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
import { parse } from "csv-parse/sync";
const api = await fetch(
  "https://api.github.com/repos/OpenITI/RELEASE/commits/master",
  { headers: { "User-Agent": "MLibrary" }, signal: AbortSignal.timeout(30000) },
);
if (!api.ok) throw new Error(`OpenITI revision lookup returned ${api.status}`);
const revision = (await api.json()).sha;
if (!/^[a-f0-9]{40}$/.test(revision))
  throw new Error("Invalid corpus revision");
try {
  const previous = JSON.parse(
    gunzipSync(await readFile("server/data/openiti.json.gz")),
  );
  if (previous.revision === revision) {
    console.log(
      "OpenITI catalogue is already at the current release revision.",
    );
    process.exit(0);
  }
} catch {
  /* Initial import. */
}
const listing = await fetch(
  `https://api.github.com/repos/OpenITI/RELEASE/contents/metadata?ref=${revision}`,
  { headers: { "User-Agent": "MLibrary" }, signal: AbortSignal.timeout(30000) },
);
if (!listing.ok) throw new Error("OpenITI metadata listing is unavailable");
const files = await listing.json();
const metadataPath = files
  .filter((f) => /^OpenITI_metadata_\d{4}-\d+-\d+\.tsv$/.test(f.name))
  .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }))
  .at(-1)?.path;
if (!metadataPath)
  throw new Error("No supported OpenITI release metadata found");
const response = await fetch(
  `https://raw.githubusercontent.com/OpenITI/RELEASE/${revision}/${metadataPath}`,
  { signal: AbortSignal.timeout(60000) },
);
if (!response.ok)
  throw new Error(`OpenITI metadata returned ${response.status}`);
const text = await response.text();
if (Buffer.byteLength(text) > 25 * 1024 * 1024)
  throw new Error("Metadata size limit exceeded");
const rows = parse(text, {
  columns: true,
  delimiter: "\t",
  bom: true,
  relax_quotes: true,
});
const records = [],
  seen = new Set();
for (const row of rows) {
  if (
    row.language !== "ara" ||
    row.status !== "pri" ||
    !row.title_ar ||
    !/^\d{4}[A-Za-z0-9]+\.[A-Za-z0-9]+\.[A-Za-z0-9_-]+$/.test(row.version_uri)
  )
    continue;
  if (
    !/^data\/[A-Za-z0-9]+\/[A-Za-z0-9.]+\/[A-Za-z0-9._-]+$/.test(
      row.local_path,
    ) ||
    row.local_path.includes("..") ||
    !row.local_path.endsWith(row.version_uri)
  )
    continue;
  if (seen.has(row.version_uri)) continue;
  seen.add(row.version_uri);
  records.push({
    id: row.version_uri,
    path: row.local_path,
    title: row.title_ar,
    author: row.author_ar || row.author_lat,
    titleLatin: row.title_lat,
    authorLatin: row.author_lat,
    chars: Number(row.char_length),
    tags: row.tags
      .split(" :: ")
      .filter((t) => !t.includes("@"))
      .slice(0, 12),
    ocr: row.uncorrected_OCR === "True",
  });
}
if (records.length < 5000)
  throw new Error("Incomplete OpenITI catalogue; previous snapshot retained");
const snapshot = {
  updatedAt: new Date().toISOString(),
  revision,
  metadataPath,
  license: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
  records,
};
await writeFile(
  "server/data/openiti.json.gz",
  gzipSync(JSON.stringify(snapshot), { level: 9 }),
);
console.log(
  JSON.stringify({
    records: records.length,
    revision,
    languages: ["ar"],
    license: "CC BY-NC-SA 4.0",
  }),
);
