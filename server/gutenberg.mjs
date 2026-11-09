import { readFile } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
import { parse } from "csv-parse/sync";
import { store } from "./storage.mjs";
const FEED = "https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv";
let memo,
  memoAt = 0;
const favorites = [
  1342, 11, 84, 2701, 174, 1661, 1184, 141, 2650, 13951, 74, 98, 345, 1232,
  5200, 219,
];
export function parseFeed(csv) {
  return parse(csv, { columns: true, skip_empty_lines: true, bom: true })
    .filter(
      (r) =>
        r.Type === "Text" &&
        r.Language.split(";").some((l) =>
          ["en", "fr", "ar"].includes(l.trim()),
        ),
    )
    .map((r) => [
      Number(r["Text#"]),
      r.Title.replace(/\r?\n/g, " — "),
      r.Language.split(";").map((l) => l.trim()),
      r.Authors.split(";").map((a) =>
        a.trim().replace(/, (?:ca\. )?-?\d{1,4}.*$/, ""),
      ),
      r.Subjects.split(";").map((s) => s.trim()),
      r.Issued,
    ]);
}
export function fromTuple(row) {
  return {
    id: `gutenberg:${row[0]}`,
    title: row[1],
    authors: row[3].filter(Boolean),
    language: row[2].find((l) => ["en", "fr", "ar"].includes(l)) || "en",
    languages: row[2],
    source: "gutenberg",
    sourceUrl: `https://www.gutenberg.org/ebooks/${row[0]}`,
    cover: null,
    subjects: row[4].slice(0, 8),
    description: row[4].join(" · "),
    access: "read",
    rights:
      "Project Gutenberg edition. US public-domain status is checked before online reading; check local rules for other countries.",
    formats: ["TXT"],
    issued: row[5],
  };
}
export async function loadIndex() {
  if (memo && Date.now() - memoAt < 3600000) return memo;
  let bytes;
  if (
    process.env.NETLIFY ||
    process.env.NETLIFY_BLOBS_CONTEXT ||
    globalThis.netlifyBlobsContext
  ) {
    try {
      bytes = await store().get("catalog/gutenberg/index.gz", {
        type: "arrayBuffer",
      });
    } catch {
      /* Bundled snapshot remains available. */
    }
  }
  if (!bytes) bytes = await readFile("server/data/gutenberg.json.gz");
  memo = JSON.parse(gunzipSync(Buffer.from(bytes)).toString("utf8"));
  memoAt = Date.now();
  return memo;
}
const normalize = (value) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f\u064B-\u065F]/g, "")
    .toLocaleLowerCase();
export async function searchGutenberg({ q, language, page }) {
  const index = await loadIndex();
  const terms = normalize(q).split(/\s+/).filter(Boolean);
  const rows = index.rows.filter(
    (r) =>
      (language === "all" || r[2].includes(language)) &&
      (!terms.length ||
        terms.every((term) =>
          normalize(`${r[1]} ${r[3].join(" ")} ${r[4].join(" ")}`).includes(
            term,
          ),
        )),
  );
  if (!q)
    rows.sort((a, b) => {
      const ia = favorites.indexOf(a[0]),
        ib = favorites.indexOf(b[0]);
      return (ia < 0 ? 1000 : ia) - (ib < 0 ? 1000 : ib) || b[0] - a[0];
    });
  return {
    source: "gutenberg",
    count: rows.length,
    hasMore: page * 24 < rows.length,
    books: rows.slice((page - 1) * 24, page * 24).map(fromTuple),
    snapshot: index.updatedAt,
  };
}
export async function refreshIndex() {
  const s = store();
  const previous = await s.get("sync/state", { type: "json" });
  const response = await fetch(FEED, {
    headers: previous?.lastModified
      ? { "If-Modified-Since": previous.lastModified }
      : {},
    signal: AbortSignal.timeout(22000),
  });
  if (response.status === 304) {
    await s.setJSON("sync/state", {
      ...previous,
      status: "ok",
      lastAttempt: new Date().toISOString(),
    });
    return { changed: false, records: previous.records };
  }
  if (!response.ok)
    throw new Error(`Gutenberg feed returned ${response.status}`);
  const rows = parseFeed(await response.text());
  if (rows.length < 40000)
    throw new Error(
      "Feed validation failed; keeping the last complete catalogue.",
    );
  const updatedAt = new Date().toISOString();
  await s.set(
    "catalog/gutenberg/index.gz",
    gzipSync(JSON.stringify({ updatedAt, source: FEED, rows })),
  );
  await s.setJSON("sync/state", {
    status: "ok",
    records: rows.length,
    lastAttempt: updatedAt,
    lastSuccess: updatedAt,
    lastModified: response.headers.get("last-modified"),
    languages: Object.fromEntries(
      ["en", "fr", "ar"].map((l) => [
        l,
        rows.filter((r) => r[2].includes(l)).length,
      ]),
    ),
  });
  memo = { updatedAt, source: FEED, rows };
  memoAt = Date.now();
  return { changed: true, records: rows.length };
}
