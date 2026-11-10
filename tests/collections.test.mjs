import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import {
  hindawiLink,
  hindawiEdition,
  hindawiFileChunk,
} from "../server/hindawi.mjs";
import { gallicaLink, gallicaBook, searchGallica } from "../server/gallica.mjs";
import handler from "../server/api.mjs";

test("collection links accept official book identities and reject arbitrary file targets", () => {
  for (const host of ["www.safahat.org", "www.hindawi.org"])
    assert.equal(hindawiLink(`https://${host}/books/86869064/`), "86869064");
  assert.equal(
    hindawiLink("https://downloads.hindawi.org/books/86869064.pdf"),
    "86869064",
  );
  for (const url of [
    "https://example.com/books/86869064/",
    "http://www.safahat.org/books/86869064/",
    "https://user@www.safahat.org/books/86869064/",
    "https://downloads.hindawi.org/books/86869064.epub",
    "https://www.safahat.org/books/86869064/?url=http://localhost",
    "https://www.safahat.org/books/%2e%2e/books/86869064/",
    "https://www.safahat.org/books/123/",
  ])
    assert.throws(() => hindawiLink(url));
  assert.equal(
    gallicaLink("https://gallica.bnf.fr/ark:/12148/bpt6k5493777b"),
    "bpt6k5493777b",
  );
  assert.throws(() =>
    gallicaLink("https://gallica.bnf.fr.evil.test/ark:/12148/bpt6k5493777b"),
  );
});
test("Safahat metadata and chunks use one complete PDF without changing its bytes", async (t) => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  pdf.setTitle("عنوان عربي");
  pdf.setAuthor("مؤلف");
  const bytes = Buffer.from(await pdf.save());
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls++;
    assert.equal(url, "https://downloads.hindawi.org/books/11111111.pdf");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.Range, undefined);
    return new Response(bytes, {
      headers: { "Content-Length": String(bytes.length) },
    });
  });
  const [first, second] = await Promise.all([
    hindawiEdition("11111111"),
    hindawiEdition("11111111"),
  ]);
  assert.equal(first.book.title, "عنوان عربي");
  assert.equal(second.book.authors[0], "مؤلف");
  const chunk = await hindawiFileChunk("11111111", 0, 1048575);
  assert.deepEqual(chunk.bytes, bytes);
  assert.equal(chunk.size, bytes.length);
  assert.equal(calls, 1);
  await assert.rejects(hindawiFileChunk("11111111", -1, 100));
  await assert.rejects(
    hindawiFileChunk("11111111", bytes.length, bytes.length + 4),
  );
});
test("challenge pages, truncated and encrypted PDFs never become offline-ready editions", async (t) => {
  const responses = [
    new Response("<html>Verification</html>"),
    new Response("%PDF-short", { headers: { "Content-Length": "100" } }),
    new Response(readFileSync("tests/fixtures/encrypted.pdf")),
  ];
  t.mock.method(globalThis, "fetch", async () => responses.shift());
  await assert.rejects(hindawiEdition("22222222"), /complete PDF/);
  await assert.rejects(hindawiEdition("33333333"), /complete PDF/);
  await assert.rejects(hindawiEdition("44444444"), /encrypted/);
});
test("Gallica search and reading use validated complete documents with original attribution", async () => {
  const index = JSON.parse(
    gunzipSync(readFileSync("server/data/gallica.json.gz")),
  );
  assert.equal(index.records.length, 232);
  assert.equal(index.excluded.length, 23);
  assert.equal(searchGallica({ language: "ar" }).count, 0);
  const result = searchGallica({ q: "Germinal", language: "fr" });
  assert.equal(result.count, 1);
  assert.equal(result.source, "gallica");
  const edition = gallicaBook(result.books[0].id.split(":")[1]);
  assert.ok(edition.content.text.length > 100000);
  assert.match(edition.content.attribution, /BnF–OBVIL/);
  for (const { book, text } of index.records) {
    assert.ok(text.length > 100);
    assert.ok(Buffer.byteLength(text) <= 4 * 1024 * 1024);
    assert.equal(gallicaLink(book.sourceUrl), book.id.split(":")[1]);
    assert.match(book.rights, /Gallica reuse conditions/);
  }
  const response = await handler(
    new Request(
      "https://app.test/api/import-collection?source=gallica&url=" +
        encodeURIComponent(result.books[0].sourceUrl),
    ),
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).book.id, result.books[0].id);
  const missing = await handler(
    new Request("https://app.test/api/content?id=gallica:bpt6k9999999z"),
  );
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).code, "not-imported");
});
test("provider denial propagates without retry and rate limits stop subsequent downloads", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response("denied", { status: calls === 1 ? 403 : 429 });
  });
  const denied = await handler(
    new Request("https://app.test/api/content?id=hindawi:55555555"),
  );
  assert.equal(denied.status, 403);
  assert.equal(calls, 1);
  await assert.rejects(hindawiEdition("66666666"), (e) => e.status === 429);
  await assert.rejects(hindawiEdition("77777777"), (e) => e.status === 429);
  assert.equal(calls, 2);
});
