import { mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { fetchUpstream, searchCatalog } from "../server/catalog.mjs";
import { parseFeed, fromTuple } from "../server/gutenberg.mjs";
await mkdir("public/data", { recursive: true });
await mkdir("server/data", { recursive: true });
const source = "https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv";
const response = await fetch(source, { signal: AbortSignal.timeout(90000) });
if (!response.ok) throw new Error(`Feed returned ${response.status}`);
const rows = parseFeed(await response.text());
const updatedAt = new Date().toISOString();
await writeFile(
  "server/data/gutenberg.json.gz",
  gzipSync(JSON.stringify({ rows, updatedAt, source })),
);
const ids = [
  1342, 11, 84, 2701, 174, 1661, 1184, 141, 2650, 13951, 74, 98, 345, 1232,
  5200, 219,
];
const books = ids
  .map((id) => rows.find((r) => r[0] === id))
  .filter(Boolean)
  .map(fromTuple);
const french = rows
  .filter((r) => r[2].includes("fr"))
  .slice(-12)
  .map(fromTuple);
const arabic = await searchCatalog({
  q: "ألف ليلة",
  source: "wikisource",
  language: "ar",
  page: 1,
});
const featured = [
  ...new Map(
    [...books, ...french, ...arabic.books.slice(0, 8)].map((b) => [b.id, b]),
  ).values(),
];
const counts = Object.fromEntries(
  ["en", "fr", "ar"].map((l) => [
    l,
    rows.filter((r) => r[2].includes(l)).length,
  ]),
);
await writeFile(
  "public/data/featured.json",
  JSON.stringify(
    { books: featured, updatedAt, indexed: rows.length, counts },
    null,
    2,
  ),
);
await writeFile(
  "public/data/catalogue-stats.json",
  JSON.stringify({ updatedAt, indexed: rows.length, counts, source }, null, 2),
);
console.log(
  JSON.stringify({ indexed: rows.length, counts, featured: featured.length }),
);
for (const id of [1342, 11]) {
  const response = await fetchUpstream(
    `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`,
    { headers: { Accept: "text/plain" }, signal: AbortSignal.timeout(30000) },
  );
  const text = await response.text();
  await writeFile(
    `public/data/gutenberg-${id}.json`,
    JSON.stringify({
      type: "text",
      text,
      chapters: [],
      sourceUrl: `https://www.gutenberg.org/ebooks/${id}`,
      attribution:
        "Project Gutenberg · Public domain in the USA. The source license is preserved in this edition.",
    }),
  );
  console.log(`Saved full text ${id}: ${text.length} characters.`);
}
