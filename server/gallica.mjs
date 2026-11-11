import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
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
export function gallicaMetadata(id) {
  if (!/^bpt6k\d+[a-z0-9]$/.test(id))
    throw new Error("Invalid Gallica edition");
  const record = records().find((r) => r.book.id === `gallica:${id}`);
  if (!record)
    throw Object.assign(
      new Error("This edition is not in the imported Gallica text collection."),
      { status: 404, code: "not-imported" },
    );
  return record;
}
export async function gallicaBook(id, origin) {
  const record = gallicaMetadata(id),
    path = `data/gallica/${id}.json.gz`;
  let bytes;
  const base = process.env.DEPLOY_URL || origin;
  // Lambda runtime does not necessarily expose NETLIFY/DEPLOY_URL. The API
  // supplies its own origin, constrained to this site's deployment hostnames.
  if (
    base &&
    /^https:\/\/(?:[a-z0-9-]+--)?mlibrary-fedimechergui\.netlify\.app$/.test(
      base,
    )
  ) {
    const response = await fetch(`${base}/${path}`, {
      signal: AbortSignal.timeout(20000),
      redirect: "error",
    });
    if (!response.ok)
      throw new Error(`Gallica collection file returned ${response.status}`);
    const reader = response.body.getReader(),
      chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 5 * 1024 * 1024) {
        await reader.cancel();
        throw new Error("Gallica collection size limit exceeded");
      }
      chunks.push(value);
    }
    bytes = Buffer.concat(chunks);
  } else bytes = await readFile(`public/${path}`);
  if (
    bytes.length !== record.bytes ||
    createHash("sha256").update(bytes).digest("hex") !== record.sha256
  )
    throw new Error("Gallica collection integrity check failed");
  return {
    book: record.book,
    content: JSON.parse(
      gunzipSync(bytes, { maxOutputLength: 5 * 1024 * 1024 }),
    ),
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
