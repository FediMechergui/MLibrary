import test from "node:test";
import assert from "node:assert/strict";
import { resolveArchive } from "../server/reading.mjs";
import { readLimited, getContent } from "../server/content.mjs";
import { searchCatalog, validateSearch } from "../server/catalog.mjs";
import { sourcePolicy, diagnose } from "../server/source-policy.mjs";
import {
  standardBook,
  standardFileChunk,
  standardUrlPath,
} from "../server/standardebooks.mjs";
const files = [
  { name: "text.txt", format: "DjVuTXT", size: "100" },
  { name: "book.epub", format: "EPUB", size: "500" },
  { name: "scan.pdf", format: "Text PDF", size: "1000" },
];
test("format preference selects original scans and automatic recovers from broken text", async (t) => {
  let downloads = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).includes("metadata/"))
      return Response.json({ metadata: { title: "Formats" }, files });
    downloads++;
    return new Response("<html>Source error page</html>");
  });
  const pdf = await resolveArchive("formats", readLimited, "pdf");
  assert.equal(pdf.format, "pdf");
  assert.equal(downloads, 0);
  const automatic = await resolveArchive("formats", readLimited);
  assert.equal(automatic.format, "epub");
  assert.equal(downloads, 1);
  await assert.rejects(
    resolveArchive("formats", readLimited, "text"),
    /readable book text/,
  );
  await assert.rejects(
    getContent("archive:formats", { format: "html" }),
    /Invalid reader format/,
  );
});
test("missing formats and restricted editions have distinct recovery reasons", async (t) => {
  let restricted = false;
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      metadata: { "access-restricted-item": restricted },
      files: [files[0]],
    }),
  );
  assert.equal(
    (await resolveArchive("formats", readLimited, "pdf")).reason,
    "format",
  );
  restricted = true;
  assert.equal(
    (await resolveArchive("formats", readLimited, "pdf")).reason,
    "restricted",
  );
});
test("disabled providers are never requested by federated search", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Excluded providers must not run");
  });
  const options = validateSearch(
    new URLSearchParams("q=Alice&exclude=wikisource,archive,openlibrary,doab,oapen"),
  );
  const result = await searchCatalog(options);
  assert.ok(result.books.length);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    result.sources.map((s) => s.source),
    ["gutenberg"],
  );
  assert.throws(() => validateSearch(new URLSearchParams("exclude=unknown")));
});
test("operator source policies stay bounded and failure diagnostics identify actionable causes", (t) => {
  const previous = process.env.SOURCE_POLICIES;
  t.after(() => {
    if (previous === undefined) delete process.env.SOURCE_POLICIES;
    else process.env.SOURCE_POLICIES = previous;
  });
  process.env.SOURCE_POLICIES = '{"archive":{"timeoutMs":90000,"retries":100}}';
  assert.deepEqual(sourcePolicy("archive"), { timeoutMs: 15000, retries: 1 });
  assert.equal(
    diagnose(Object.assign(new Error("Source returned 403"), { status: 403 }))
      .code,
    "access",
  );
  assert.equal(
    diagnose(new DOMException("slow", "TimeoutError")).code,
    "timeout",
  );
  assert.equal(diagnose(new Error("Source returned 429")).code, "rate-limit");
});
test("individual publisher imports validate host, metadata and actual bounded EPUB ranges", async (t) => {
  for (const url of [
    "http://standardebooks.org/ebooks/a/b",
    "https://evil.test/ebooks/a/b",
    "https://standardebooks.org/ebooks/a/b?redirect=evil",
    "https://user:password@standardebooks.org/ebooks/a/b",
  ])
    assert.throws(() => standardUrlPath(url));
  assert.equal(
    standardUrlPath("https://standardebooks.org/ebooks/test-author/test-book"),
    "test-author/test-book",
  );
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(options.redirect, "error");
    if (!String(url).includes("downloads"))
      return new Response(
        '<h1 property="schema:name">Test book</h1><a property="schema:author"><span property="schema:name">Test author</span></a><a class="epub" href="/ebooks/test-author/test-book/downloads/test.epub">EPUB</a>',
      );
    assert.match(String(url), /\?source=download$/);
    return new Response("PK123456", {
      status: 206,
      headers: { "content-range": "bytes 0-7/8" },
    });
  });
  const { book, content } = await standardBook("test-author/test-book");
  assert.equal(book.title, "Test book");
  assert.equal(content.format, "epub");
  const bytes = await standardFileChunk("test-author/test-book", 0, 31);
  assert.equal(bytes.bytes.toString(), "PK123456");
  await assert.rejects(
    standardFileChunk("test-author/test-book", 0, 1048576),
    /Invalid reader file range/,
  );
});
test("Open Library work-level alternatives verify item language before reading", async (t) => {
  const { resolveOpenLibrary } = await import("../server/reading.mjs");
  const downloaded = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).includes("search.json"))
      return Response.json({
        docs: [
          { ia: ["english-only", "french-public"], editions: { docs: [] } },
        ],
      });
    if (String(url).includes("metadata/"))
      return Response.json({
        metadata: {
          title: "A work",
          language: String(url).includes("english-only") ? "eng" : "fre",
        },
        files: [files[0]],
      });
    downloaded.push(String(url));
    return new Response("Texte français.");
  });
  const content = await resolveOpenLibrary("OL111W", "fr", readLimited);
  assert.equal(content.text, "Texte français.");
  assert.equal(downloaded.length, 1);
  assert.match(downloaded[0], /french-public/);
});
