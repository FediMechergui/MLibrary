import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
let snapshot;
function records() {
  snapshot ||= JSON.parse(
    gunzipSync(readFileSync("server/data/gallica.json.gz")),
  ).records;
  return snapshot;
}
const normalize = (value) =>
  value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
export function searchGallica({ q = "", language = "all", page = 1 }) {
  const terms = normalize(q).split(/\s+/).filter(Boolean);
  const matches = ["all", "fr"].includes(language)
    ? records().filter(({ book }) =>
        terms.every((term) =>
          normalize(`${book.title} ${book.authors.join(" ")}`).includes(term),
        ),
      )
    : [];
  return {
    source: "gallica",
    books: matches.slice((page - 1) * 24, page * 24).map(({ book }) => book),
    count: matches.length,
    hasMore: page * 24 < matches.length,
  };
}
export function gallicaBook(id) {
  if (!/^bpt6k\d+[a-z0-9]$/.test(id))
    throw new Error("Invalid Gallica edition");
  const record = records().find((r) => r.book.id === `gallica:${id}`);
  if (!record)
    throw Object.assign(
      new Error("This edition is not in the imported Gallica text collection."),
      { status: 404, code: "not-imported" },
    );
  return {
    book: record.book,
    content: {
      type: "text",
      text: record.text,
      chapters: [],
      sourceUrl: record.book.sourceUrl,
      attribution: record.book.rights,
    },
  };
}
export function gallicaLink(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid Gallica book link");
  }
  const match = /^\/ark:\/12148\/(bpt6k\d+[a-z0-9])\/?$/.exec(url.pathname);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "gallica.bnf.fr" ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    !match
  )
    throw new Error("Invalid Gallica book link");
  return match[1];
}
