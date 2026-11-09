import test from "node:test";
import assert from "node:assert/strict";
import {
  archiveResponse,
  getReaderFileChunk,
  publicFiles,
  resolveArchive,
  resolveOpenLibrary,
} from "../server/reading.mjs";
import { handler as lambda } from "../netlify/functions/api.js";
import { getContent, parseBookId, readLimited } from "../server/content.mjs";

const item = {
  metadata: { title: "An open edition", rights: "Public Domain" },
  files: [{ name: "book_djvu.txt", format: "DjVuTXT", size: "100" }],
};
test("reader file delivery bounds each range, verifies availability and preserves binary bytes through Lambda", async (t) => {
  const data = Uint8Array.from([0, 255, 128, 37, 80, 68, 70, 45]);
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url).includes("metadata"))
      return Response.json({
        metadata: { title: "Scan" },
        files: [
          { name: "scan.pdf", format: "Text PDF", size: String(data.length) },
        ],
      });
    assert.equal(options.headers.Range, "bytes=0-7");
    return new Response(data, {
      status: 206,
      headers: { "content-range": `bytes 0-7/${data.length}` },
    });
  });
  const chunk = await getReaderFileChunk("range-public", "scan.pdf", 0, 262143);
  assert.deepEqual([...chunk.bytes], [...data]);
  const result = await lambda({
    httpMethod: "GET",
    rawUrl:
      "https://mlibrary.test/api/file?id=range-public&name=scan.pdf&start=0&end=7",
    headers: {},
  });
  assert.equal(result.isBase64Encoded, true);
  assert.deepEqual([...Buffer.from(result.body, "base64")], [...data]);
  assert.equal(result.headers["x-book-length"], "8");
  for (const args of [
    ["range-public", "../scan.pdf", 0, 7],
    ["../private", "scan.pdf", 0, 7],
    ["range-public", "scan.pdf", 0, 1048576],
    ["range-public", "scan.pdf", -1, 7],
  ])
    await assert.rejects(getReaderFileChunk(...args), /Invalid/);
});
test("reader file endpoint never fetches private or encrypted files and rejects a server ignoring the requested range", async (t) => {
  let files = 0;
  const mock = t.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).includes("metadata"))
      return Response.json({
        metadata: { "access-restricted-item": true },
        files: [{ name: "scan.pdf", format: "Text PDF", size: "8" }],
      });
    files++;
    return new Response("denied");
  });
  await assert.rejects(
    getReaderFileChunk("range-private", "scan.pdf", 0, 7),
    /No publicly/,
  );
  assert.equal(files, 0);
  mock.mock.restore();
  t.mock.method(globalThis, "fetch", async (url) =>
    String(url).includes("metadata")
      ? Response.json({
          metadata: {},
          files: [{ name: "scan.pdf", format: "Text PDF", size: "8" }],
        })
      : new Response("full download", { status: 200 }),
  );
  await assert.rejects(
    getReaderFileChunk("range-ignored", "scan.pdf", 0, 7),
    /requested book pages/,
  );
});
test("licensed public text is readable; restricted, encrypted, private and dark items are not downloaded", async (t) => {
  for (const patch of [
    {},
    { metadata: { ...item.metadata, "access-restricted-item": "true" } },
    { metadata: { ...item.metadata, "access-restricted-item": true } },
    { is_dark: true },
    { files: [{ ...item.files[0], private: "true" }] },
    { files: [{ ...item.files[0], format: "ACS Encrypted PDF" }] },
  ]) {
    const value = { ...item, ...patch };
    let downloads = 0;
    const mock = t.mock.method(globalThis, "fetch", async (url) => {
      if (String(url).includes("/metadata/")) return Response.json(value);
      downloads++;
      return new Response("A readable public-domain passage.");
    });
    const result = await resolveArchive("public-book", readLimited);
    const expected = Object.keys(patch).length ? "source" : "text";
    assert.equal(result.type, expected);
    assert.equal(downloads, expected === "text" ? 1 : 0);
    mock.mock.restore();
  }
});
test("publicly downloadable editions without a license label still open as book content, with source attribution", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ ...item, metadata: { title: "Old scan" } }),
  );
  const result = await resolveArchive("old-scan", readLimited);
  assert.equal(result.type, "text");
  assert.match(result.attribution, /Internet Archive/);
  assert.equal(result.embedUrl, undefined);
});
test("archive redirects cannot leave the approved HTTPS domain boundary", async (t) => {
  for (const url of [
    "https://archive.org.evil.test/book",
    "https://evil-archive.org/book",
    "http://archive.org/book",
    "https://user:pass@archive.org/book",
    "https://127.0.0.1/book",
  ]) {
    let calls = 0;
    const mock = t.mock.method(globalThis, "fetch", async () => {
      calls++;
      return new Response(null, { status: 302, headers: { location: url } });
    });
    await assert.rejects(
      archiveResponse("https://archive.org/download/book/text.txt"),
      /host/,
    );
    assert.equal(calls, 1);
    mock.mock.restore();
  }
});
test("archive IDs and filenames cannot turn into traversal paths", () => {
  for (const id of [
    "archive:../secret",
    "archive:abc/def",
    "archive:abc?x=y",
    "openlibrary:OL1W/secret",
    "openlibrary:OL1M",
  ])
    assert.throws(() => parseBookId(id));
  const files = publicFiles({
    ...item,
    files: ["../x", "a/b", "a\\b", "a\n.txt", "normal.txt"].map((name) => ({
      name,
      format: "Text",
    })),
  });
  assert.deepEqual(
    files.map((f) => f.name),
    ["normal.txt"],
  );
});
test("large public PDFs resolve to the book file while inaccessible editions never return an embed URL", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      metadata: { title: "Public scan" },
      files: [{ name: "scan.pdf", format: "Text PDF", size: "120000000" }],
    }),
  );
  const content = await resolveArchive("scan", readLimited);
  assert.equal(content.type, "remote");
  assert.equal(content.format, "pdf");
  assert.equal(content.url, "https://archive.org/download/scan/scan.pdf");
  assert.equal(content.embedUrl, undefined);
});
test("Open Library tries another matching edition when the first has no accessible reader file", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => {
    const value = String(url);
    if (value.includes("search.json"))
      return Response.json({
        docs: [
          {
            editions: {
              docs: [{ ia: ["restricted-edition"], language: ["eng"] }],
            },
          },
        ],
      });
    if (value.includes("editions.json"))
      return Response.json({
        entries: [
          { ocaid: "public-edition", languages: [{ key: "/languages/eng" }] },
          { ocaid: "other-language", languages: [{ key: "/languages/fre" }] },
        ],
      });
    if (value.includes("restricted-edition"))
      return Response.json({
        ...item,
        metadata: { ...item.metadata, "access-restricted-item": true },
      });
    if (value.includes("metadata/public-edition")) return Response.json(item);
    if (value.includes("download/public-edition"))
      return new Response("The actual book.");
    throw new Error("Unexpected edition request");
  });
  const content = await resolveOpenLibrary("OL123W", "en", readLimited);
  assert.equal(content.type, "text");
  assert.equal(content.text, "The actual book.");
});
test("Open Library resolves a matching language edition and never falls back to an unrelated language", async (t) => {
  let archives = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).includes("search.json"))
      return Response.json({
        docs: [
          {
            editions: {
              docs: [
                { ia: ["english-edition"], language: ["eng"] },
                { ia: ["french-edition"], language: ["fre"] },
              ],
            },
          },
        ],
      });
    if (String(url).includes("metadata")) {
      assert.match(String(url), /french-edition/);
      archives++;
      return Response.json(item);
    }
    return new Response("Une page libre.");
  });
  const result = await resolveOpenLibrary("OL123W", "fr", readLimited);
  assert.equal(result.type, "text");
  assert.equal(archives, 1);
  const arabic = await resolveOpenLibrary("OL123W", "ar", readLimited);
  assert.equal(arabic.type, "source");
  assert.equal(arabic.available, false);
  assert.equal(archives, 1);
});
test("Wikisource chapter navigation retains the contents and stays within the selected work", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => {
    const u = new URL(url);
    const title = u.searchParams.get("page") || "Example";
    return Response.json({
      parse: {
        title,
        text: { "*": `<p>${title} text</p>` },
        links: [
          { ns: 0, "*": "Example/Chapter 1", exists: "" },
          { ns: 0, "*": "Example/Chapter 2", exists: "" },
        ],
      },
    });
  });
  const result = await getContent("wikisource:en:123", {
    chapter: "Example/Chapter 1",
  });
  assert.equal(result.chapter, "Example/Chapter 1");
  assert.equal(result.chapters.length, 3);
  assert.equal(result.chapters[0].title, "Example");
  await assert.rejects(
    getContent("wikisource:en:123", { chapter: "Unrelated work" }),
    /does not belong/,
  );
});
