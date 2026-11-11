import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
let snapshot;
const cache = new Map();
export const openitiId = /^\d{4}[A-Za-z0-9]+\.[A-Za-z0-9]+\.[A-Za-z0-9_-]+$/;
function data() {
  return (snapshot ||= JSON.parse(
    gunzipSync(readFileSync("server/data/openiti.json.gz")),
  ));
}
const normalize = (value) =>
  value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .toLowerCase();
function book(record) {
  return {
    id: `openiti:${record.id}`,
    title: record.title,
    authors: [record.author],
    language: "ar",
    languages: ["ar"],
    source: "openiti",
    sourceUrl: `https://github.com/OpenITI/RELEASE/blob/${data().revision}/${record.path}`,
    cover: null,
    subjects: record.tags,
    description: `OpenITI primary Arabic edition${record.ocr ? "; uncorrected OCR" : ""}. Text transcription and pagination may differ from printed editions.`,
    access: "read",
    formats: ["TXT"],
    rights:
      "OpenITI / KITAB. CC BY-NC-SA 4.0 (attribution, noncommercial, share alike). https://creativecommons.org/licenses/by-nc-sa/4.0/ · https://doi.org/10.5281/zenodo.3082463",
  };
}
export function searchOpenITI({ q = "", language = "all", page = 1 }) {
  const terms = normalize(q).split(/\s+/).filter(Boolean);
  const matches = ["all", "ar"].includes(language)
    ? data().records.filter((r) =>
        terms.every((t) =>
          normalize(
            `${r.title} ${r.author} ${r.titleLatin} ${r.authorLatin}`,
          ).includes(t),
        ),
      )
    : [];
  return {
    source: "openiti",
    count: matches.length,
    hasMore: page * 24 < matches.length,
    books: matches.slice((page - 1) * 24, page * 24).map(book),
  };
}
export function cleanOpenITI(text) {
  const split = text.indexOf("#META#Header#End#");
  if (split < 0 || !text.startsWith("######OpenITI#"))
    throw new Error("Invalid OpenITI text");
  return text
    .slice(split + "#META#Header#End#".length)
    .replace(/^#META#.*$/gm, "")
    .replace(/^### \|+\s*/gm, "\n\n")
    .replace(/^#\s?/gm, "\n")
    .replace(/^~~/gm, "")
    .replace(/PageV\d+P(\d+)/g, "\n\n[ص $1]\n\n")
    .replace(/\n{4,}/g, "\n\n")
    .trim();
}
export async function openitiContent(id, chapter, fetcher = fetch) {
  if (!openitiId.test(id)) throw new Error("Unsupported book identifier");
  const record = data().records.find((r) => r.id === id);
  if (!record)
    throw Object.assign(new Error("This OpenITI edition is not indexed"), {
      status: 404,
    });
  if (chapter && !/^part-[1-9]\d{0,3}$/.test(chapter))
    throw new Error("Invalid chapter title");
  let chunks = cache.get(id);
  if (!chunks) {
    const response = await fetcher(
      `https://raw.githubusercontent.com/OpenITI/RELEASE/${data().revision}/${record.path}`,
      {
        redirect: "error",
        signal: AbortSignal.timeout(30000),
        headers: { "User-Agent": "MLibrary/1.5 (OpenITI reader)" },
      },
    );
    if (!response.ok)
      throw Object.assign(new Error(`OpenITI returned ${response.status}`), {
        status: response.status,
      });
    const reader = response.body.getReader(),
      parts = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 50 * 1024 * 1024) {
        await reader.cancel();
        throw new Error(
          "This edition exceeds the 50 MiB reader limit. Import a smaller volume.",
        );
      }
      parts.push(value);
    }
    const text = cleanOpenITI(Buffer.concat(parts).toString("utf8"));
    if (text.length < 20)
      throw new Error("OpenITI returned an empty transcription");
    // Each response fits well inside the serverless response limit.
    chunks = [];
    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + 350000, text.length);
      if (end < text.length) {
        const boundary = text.lastIndexOf("\n", end);
        if (boundary > start + 200000) end = boundary;
      }
      chunks.push(text.slice(start, end));
      start = end;
    }
    cache.set(id, chunks);
    while (
      [...cache.values()].reduce(
        (n, c) => n + c.reduce((s, t) => s + t.length * 2, 0),
        0,
      ) >
        64 * 1024 * 1024 &&
      cache.size > 1
    )
      cache.delete(cache.keys().next().value);
  }
  const index = chapter ? Number(chapter.slice(5)) - 1 : 0;
  if (index >= chunks.length) throw new Error("Invalid chapter title");
  const edition = book(record);
  return {
    type: "text",
    text: chunks[index],
    chapters:
      chunks.length > 1
        ? chunks.map((_, i) => ({
            title: `الجزء ${i + 1} / ${chunks.length}`,
            id: `part-${i + 1}`,
            url: edition.sourceUrl,
          }))
        : [],
    ...(chunks.length > 1 ? { chapter: `part-${index + 1}` } : {}),
    sourceUrl: edition.sourceUrl,
    attribution: edition.rights,
  };
}
