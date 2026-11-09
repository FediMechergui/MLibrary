import test from "node:test";
import assert from "node:assert/strict";
import {
  archiveQuery,
  deduplicate,
  searchCatalog,
  validateSearch,
} from "../server/catalog.mjs";
import { parseBookId, readLimited, getContent } from "../server/content.mjs";
import { parseFeed, searchGutenberg } from "../server/gutenberg.mjs";
import { cachedSearch, store } from "../server/storage.mjs";
import { setEnvironmentContext } from "@netlify/blobs";
import handler from "../server/api.mjs";

test("rejects invalid page, source, and language filters", () => {
  for (const query of [
    "page=0",
    "page=1.5",
    "page=101",
    "source=evil",
    "language=xx",
  ])
    assert.throws(() => validateSearch(new URLSearchParams(query)));
  assert.deepEqual(
    validateSearch(new URLSearchParams("q=%20bonjour%20&language=fr")),
    { q: "bonjour", language: "fr", source: "all", page: 1 },
  );
});
test("identifiers cannot turn the reader into an arbitrary URL proxy", () => {
  for (const id of [
    "https://127.0.0.1",
    "gutenberg:../secret",
    "wikisource:evil:1",
    "gutenberg:1?url=http://localhost",
    "wikisource:ar:0",
  ])
    assert.throws(() => parseBookId(id));
  assert.deepEqual(parseBookId("wikisource:ar:123"), {
    source: "wikisource",
    language: "ar",
    id: "123",
  });
});
test("enforces download limits even without a Content-Length header", async () => {
  await assert.rejects(
    readLimited(new Response("x".repeat(1000)), 100),
    /limit/,
  );
  assert.equal(
    await readLimited(new Response("كتاب français")),
    "كتاب français",
  );
});
test("bulk import preserves multiline titles and all supported edition languages", () => {
  const csv =
    'Text#,Type,Issued,Title,Language,Authors,Subjects,LoCC,Bookshelves\r\n1,Text,2020-01-01,"One\r\nTwo",en; fr,"Hugo, Victor, 1802-1885",Fiction,PQ,Classics\r\n2,Audio,2020-01-01,Excluded,en,Someone,Fiction,PQ,Audio\r\n';
  const rows = parseFeed(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0][1], "One — Two");
  assert.deepEqual(rows[0][2], ["en", "fr"]);
  assert.equal(rows[0][3][0], "Hugo, Victor");
});
test("search returns real indexed Gutenberg editions with language filtering and stable paging", async () => {
  const first = await searchGutenberg({ q: "", language: "en", page: 1 });
  const next = await searchGutenberg({ q: "", language: "en", page: 2 });
  assert.ok(first.count > 40000);
  assert.equal(first.books[0].id, "gutenberg:1342");
  assert.equal(first.books.length, 24);
  assert.ok(!first.books.some((a) => next.books.some((b) => a.id === b.id)));
  const french = await searchGutenberg({
    q: "misérables",
    language: "fr",
    page: 1,
  });
  assert.ok(french.books.length);
  assert.ok(french.books.every((b) => b.languages.includes("fr")));
});
test("one failed source does not discard working sources", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Source offline");
  });
  const result = await searchCatalog({
    q: "Austen",
    language: "en",
    source: "all",
    page: 1,
  });
  assert.ok(result.books.length);
  assert.ok(result.sources.some((s) => s.source === "gutenberg"));
  assert.equal(result.errors.length, 3);
});
test("cache avoids redundant upstream calls but does not cache failures as empty results", async () => {
  const options = { q: "test-cache", page: 1 };
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return {
      sources: [{ source: "test" }],
      errors: [],
      books: [{ id: "one" }],
    };
  };
  await cachedSearch(options, fetcher);
  const cached = await cachedSearch(options, fetcher);
  assert.equal(calls, 1);
  assert.equal(cached.cached, true);
});
test("copyrighted or unknown-rights Gutenberg editions are not served by the reader", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("<dcterms:rights>Copyrighted.</dcterms:rights>"),
  );
  await assert.rejects(getContent("gutenberg:123"), /permissions/);
});
test("API handles CORS, invalid input, unsupported methods, and unknown routes", async () => {
  assert.equal(
    (await handler(new Request("https://example.com/api/search?page=-1")))
      .status,
    400,
  );
  const preflight = await handler(
    new Request("https://example.com/api/search", { method: "OPTIONS" }),
  );
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), "*");
  assert.equal(
    (
      await handler(
        new Request("https://example.com/api/search", { method: "POST" }),
      )
    ).status,
    405,
  );
  assert.equal(
    (await handler(new Request("https://example.com/api/unknown"))).status,
    404,
  );
});
test("archive search escapes query syntax and preserves independent source editions", () => {
  assert.ok(!archiveQuery("title:(foo) OR *:*", "fr").includes("*:*"));
  const books = [
    { id: "1", source: "a", title: "Same" },
    { id: "1", source: "a", title: "Same" },
    { id: "2", source: "b", title: "Same" },
  ];
  assert.equal(deduplicate(books).length, 2);
});

test("Lambda storage works without an uncached edge URL", async (t) => {
  const previous = process.env.NETLIFY_BLOBS_CONTEXT;
  setEnvironmentContext({ siteID: "test-site", token: "test-token", edgeURL: "https://example.com/blobs" });
  t.mock.method(globalThis, "fetch", async () => Response.json({ status: "ok" }));
  try { assert.deepEqual(await store().get("sync/state", { type: "json" }), { status: "ok" }); }
  finally { if (previous === undefined) delete process.env.NETLIFY_BLOBS_CONTEXT; else process.env.NETLIFY_BLOBS_CONTEXT = previous; }
});
