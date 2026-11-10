import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { store } from "./storage.mjs";
let index,
  loadedAt = 0;
export function oapenId(value) {
  try {
    const url = new URL(value);
    if (
      url.hostname !== "library.oapen.org" ||
      !["https:", "http:"].includes(url.protocol)
    )
      return null;
    return (
      /^\/(?:bitstream\/(?:handle\/)?|handle\/)20\.500\.12657\/(\d{1,10})(?:\/|$)/.exec(
        url.pathname,
      )?.[1] || null
    );
  } catch {
    return null;
  }
}
export async function openAccessIndex() {
  if (index && Date.now() - loadedAt < 3600000) return index;
  let bytes;
  if (
    process.env.NETLIFY ||
    process.env.NETLIFY_BLOBS_CONTEXT ||
    globalThis.netlifyBlobsContext
  ) {
    try {
      bytes = await store().get("catalog/openaccess/index.gz", {
        type: "arrayBuffer",
      });
    } catch {
      /* bundled snapshot */
    }
  }
  index = JSON.parse(
    gunzipSync(
      bytes
        ? Buffer.from(bytes)
        : await readFile("server/data/openaccess.json.gz"),
    ),
  );
  loadedAt = Date.now();
  return index;
}
export function openAccessBook(row, source = "doab") {
  const repositoryId = oapenId(row[7]);
  return {
    id: `${source}:${source === "oapen" ? repositoryId : row[0]}`,
    source,
    title: row[1],
    authors: row[2].split(";").filter(Boolean),
    language: row[3][0],
    languages: row[3],
    subjects: row[4].split(";").filter(Boolean).slice(0, 8),
    description: row[5],
    rights:
      row[6] || "Open access; see the publisher's license for this edition.",
    sourceUrl:
      source === "oapen"
        ? `https://library.oapen.org/handle/20.500.12657/${repositoryId}`
        : `https://directory.doabooks.org/handle/20.500.12854/${row[0]}`,
    cover: null,
    access: "source",
    formats: /\.pdf(?:[?;]|$)/i.test(row[7]) ? ["PDF"] : [],
    year: Number.parseInt(row[8]) || undefined,
  };
}
const normalize = (value) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f\u064B-\u065F]/g, "")
    .toLowerCase();
export async function searchOpenAccess({ source, q, language, page }) {
  const snapshot = await openAccessIndex();
  const terms = normalize(q).split(/\s+/).filter(Boolean);
  const seen = new Set();
  const rows = snapshot.rows.filter((row) => {
    if (language !== "all" && !row[3].includes(language)) return false;
    if (source === "oapen") {
      const id = oapenId(row[7]);
      if (!id || seen.has(id)) return false;
      seen.add(id);
    }
    return terms.every((term) =>
      normalize(`${row[1]} ${row[2]} ${row[4]}`).includes(term),
    );
  });
  return {
    source,
    count: rows.length,
    hasMore: page * 24 < rows.length,
    snapshot: snapshot.updatedAt,
    books: rows
      .slice((page - 1) * 24, page * 24)
      .map((row) => openAccessBook(row, source)),
  };
}
