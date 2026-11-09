import test from "node:test";
import assert from "node:assert/strict";
import {
  archiveResponse,
  publicFiles,
  resolveArchive,
  resolveOpenLibrary,
} from "../server/reading.mjs";
import { getContent, parseBookId, readLimited } from "../server/content.mjs";

const item = {
  metadata: { title: "An open edition", rights: "Public Domain" },
  files: [{ name: "book_djvu.txt", format: "DjVuTXT", size: "100" }],
};
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
test("public scans without an explicit open license use the official embedded source reader", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ ...item, metadata: { title: "Old scan" } }),
  );
  const result = await resolveArchive("old-scan", readLimited);
  assert.equal(result.type, "source");
  assert.equal(result.available, true);
  assert.equal(result.embedUrl, "https://archive.org/embed/old-scan");
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
