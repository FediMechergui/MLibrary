import test from "node:test";
import assert from "node:assert/strict";
import {
  openAccessLink,
  approvedFile,
  parseOpenAccessRecord,
  openAccessContent,
  openAccessFileChunk,
} from "../server/openaccess.mjs";
import { searchOpenAccess } from "../server/openaccess-catalog.mjs";
import { downloadOpenAccessSnapshot } from "../server/openaccess-feed.mjs";

test("failed or malformed metadata streams cannot replace the last complete catalogue", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error("connection interrupted"));
          },
        }),
      ),
  );
  await assert.rejects(downloadOpenAccessSnapshot(), /connection interrupted/);
  globalThis.fetch.mock.mockImplementation(
    async () => new Response("wrong,columns\na,b\n"),
  );
  await assert.rejects(downloadOpenAccessSnapshot(), /metadata columns/);
  globalThis.fetch.mock.mockImplementation(
    async () =>
      new Response(
        "dc.type,dc.title,dc.language,dc.identifier.uri,BITSTREAM_Download_URL\nbook,Example,eng,https://directory.doabooks.org/handle/20.500.12854/123,\n",
      ),
  );
  await assert.rejects(downloadOpenAccessSnapshot(), /Incomplete feed/);
});
const field = (name, value) => `<field name="${name}">${value}</field>`;
function metadata(
  id,
  size,
  license = "https://creativecommons.org/licenses/by/4.0/",
) {
  return `<OAI-PMH><GetRecord><record><header><identifier>oai:library.oapen.org:20.500.12657/${id}</identifier></header><metadata><metadata>
    <element name="dc"><element name="title"><element name="none">${field("value", "Public test edition")}</element></element>
    <element name="language">${field("value", "eng")}</element></element>
    <element name="bundles"><element name="bundle">${field("name", "ORIGINAL")}<element name="bitstreams"><element name="bitstream">
    ${field("format", "application/pdf")}${field("size", size)}${field("url", `https://library.oapen.org/bitstream/20.500.12657/${id}/1/book.pdf`)}${field("rightsuri", license)}
    </element></element></element></element></metadata></metadata></record></GetRecord></OAI-PMH>`;
}
test("repository links and download paths reject arbitrary hosts, credentials and traversal", () => {
  assert.deepEqual(
    openAccessLink("https://library.oapen.org/handle/20.500.12657/25287"),
    { source: "oapen", id: "25287" },
  );
  for (const url of [
    "https://localhost/handle/20.500.12657/1",
    "https://library.oapen.org@evil.example/handle/20.500.12657/1",
    "https://library.oapen.org/handle/20.500.12854/1",
    "https://library.oapen.org/handle/20.500.12657/1?redirect=bad",
  ])
    assert.throws(() => openAccessLink(url));
  for (const url of [
    "file:///etc/passwd",
    "http://127.0.0.1/book.pdf",
    "https://library.oapen.org/other.pdf",
    "https://library.oapen.org/bitstream/20.500.12657/1/%2fsecret.pdf",
    "https://user:pass@www.ledizioni.it/wp-content/uploads/2026/01/book.pdf",
  ])
    assert.equal(approvedFile(url), null);
});
test("metadata requires the requested identity and an explicit open license", () => {
  const edition = parseOpenAccessRecord("oapen", "1", metadata("1", 200));
  assert.equal(edition.open, true);
  assert.equal(edition.book.language, "en");
  assert.match(edition.book.rights, /creativecommons/);
  assert.equal(edition.downloads[0].format, "pdf");
  assert.deepEqual(
    parseOpenAccessRecord("oapen", "1", metadata("1", 200, "not open access"))
      .downloads,
    [],
  );
  assert.throws(
    () => parseOpenAccessRecord("oapen", "2", metadata("1", 200)),
    /different edition/,
  );
  assert.throws(
    () =>
      parseOpenAccessRecord("oapen", "1", "<!DOCTYPE x>" + metadata("1", 200)),
    /declaration/,
  );
});
test("whole-file publishers download once and provide complete validated ranges", async (t) => {
  const pdf = Buffer.concat([
    Buffer.from("%PDF-1.7\n"),
    Buffer.alloc(2100000, 42),
  ]);
  let downloads = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).includes("/oai/"))
      return new Response(metadata("900001", pdf.length));
    downloads++;
    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.length),
      },
    });
  });
  const content = await openAccessContent("oapen", "900001");
  assert.deepEqual(content.file, {
    source: "oapen",
    id: "900001",
    format: "pdf",
  });
  const a = await openAccessFileChunk("oapen", "900001", "pdf", 0, 1048575);
  const b = await openAccessFileChunk(
    "oapen",
    "900001",
    "pdf",
    1048576,
    2097151,
  );
  const c = await openAccessFileChunk(
    "oapen",
    "900001",
    "pdf",
    2097152,
    3145727,
  );
  assert.deepEqual(Buffer.concat([a.bytes, b.bytes, c.bytes]), pdf);
  assert.equal(downloads, 1);
  assert.equal(a.size, pdf.length);
  await assert.rejects(
    openAccessFileChunk("oapen", "900001", "pdf", -1, 2),
    /range/,
  );
});
test("incomplete files never populate the download cache and redirects stay on the approved host", async (t) => {
  let attempt = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).includes("/oai/"))
      return new Response(metadata("900002", 20));
    attempt++;
    if (attempt === 1) return new Response("%PDF-short");
    return new Response(null, {
      status: 302,
      headers: { Location: "http://127.0.0.1/book.pdf" },
    });
  });
  await assert.rejects(
    openAccessFileChunk("oapen", "900002", "pdf", 0, 10),
    /Incomplete/,
  );
  await assert.rejects(
    openAccessFileChunk("oapen", "900002", "pdf", 0, 10),
    /redirect/,
  );
  assert.equal(attempt, 2);
});
test("DOAB and OAPEN catalogue filters use declared languages and retain source identities", async () => {
  for (const language of ["en", "fr", "ar"]) {
    const result = await searchOpenAccess({
      source: "doab",
      q: "",
      language,
      page: 1,
    });
    assert.ok(result.count > 0);
    assert.ok(
      result.books.every(
        (book) =>
          book.languages.includes(language) && book.id.startsWith("doab:"),
      ),
    );
  }
  const result = await searchOpenAccess({
    source: "oapen",
    q: "",
    language: "en",
    page: 1,
  });
  assert.ok(result.count > 10000);
  assert.ok(
    result.books.every(
      (book) =>
        book.id.startsWith("oapen:") &&
        book.sourceUrl.startsWith("https://library.oapen.org/handle/"),
    ),
  );
});
test("rate limiting stops requests rather than retrying or switching identities", async (t) => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    return new Response("Slow down", {
      status: 429,
      headers: { "Retry-After": "60" },
    });
  });
  await assert.rejects(
    openAccessContent("oapen", "900003"),
    (error) => error.status === 429,
  );
  await assert.rejects(
    openAccessContent("oapen", "900004"),
    (error) => error.status === 429,
  );
  assert.equal(requests, 1);
});
