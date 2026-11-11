import { mkdir, writeFile } from "node:fs/promises";
import { sourceDirectory, searchCatalog } from "../server/catalog.mjs";
import { getContent } from "../server/content.mjs";
import { getReaderFileChunk } from "../server/reading.mjs";

// A bounded, repeatable live audit; no crawling or authentication bypass.
const checks = [];
async function check(source, name, run) {
  const started = Date.now();
  let result;
  try {
    result = { status: "pass", ...(await run()) };
  } catch (error) {
    result = { status: "fail", error: error.message, cause: error.cause?.code };
  }
  const entry = { source, name, ...result, ms: Date.now() - started };
  checks.push(entry);
  console.log(JSON.stringify(entry));
}
async function probe(url, expected) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    headers: {
      "User-Agent": "MLibrary/1.5 (https://github.com/FediMechergui/MLibrary)",
    },
  });
  const reader = response.body?.getReader();
  let bytes = 0,
    sample = "",
    signature;
  if (reader) {
    while (bytes < 128000) {
      const { value, done } = await reader.read();
      if (done) break;
      signature ??= Buffer.from(value.subarray(0, 5)).toString("hex");
      bytes += value.length;
      sample += new TextDecoder().decode(value);
    }
    await reader.cancel();
  }
  return {
    status:
      response.ok && (!expected || signature?.startsWith(expected))
        ? "pass"
        : "fail",
    http: response.status,
    url: response.url,
    contentType: response.headers.get("content-type"),
    bytes,
    signature,
    title: /<title[^>]*>([^<]+)/i.exec(sample)?.[1],
    sample: sample.startsWith("{") ? sample.slice(0, 150) : undefined,
  };
}
for (let i = 0; i < sourceDirectory.length; i += 2) {
  await Promise.all(
    sourceDirectory
      .slice(i, i + 2)
      .map((s) => check(s.id, "collection page", () => probe(s.url))),
  );
}
const endpoints = [
  ["hindawi", "original publisher redirect", "https://www.hindawi.org/books/"],
  ["standardebooks", "anonymous OPDS", "https://standardebooks.org/feeds/opds"],
  [
    "standardebooks",
    "EPUB link returns landing HTML",
    "https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice/downloads/jane-austen_pride-and-prejudice.epub",
    "504b",
  ],
  [
    "standardebooks",
    "individual EPUB via publisher download action",
    "https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice/downloads/jane-austen_pride-and-prejudice.epub?source=download",
    "504b",
  ],
  [
    "gallica",
    "document metadata",
    "https://gallica.bnf.fr/services/OAIRecord?ark=ark:/12148/bpt6k5619759j",
  ],
  [
    "gallica",
    "scan manifest",
    "https://gallica.bnf.fr/iiif/ark:/12148/bpt6k5619759j/manifest.json",
  ],
  [
    "oapen",
    "documented REST search",
    "https://library.oapen.org/rest/search?query=history&expand=metadata,bitstreams&limit=1",
  ],
  [
    "doab",
    "OAI identify",
    "https://directory.doabooks.org/oai/request?verb=Identify",
  ],
  ["qdl", "English catalogue", "https://www.qdl.qa/en/search/site"],
];
for (let i = 0; i < endpoints.length; i += 2)
  await Promise.all(
    endpoints
      .slice(i, i + 2)
      .map(([source, name, url, expected]) =>
        check(source, name, () => probe(url, expected)),
      ),
  );
const queries = {
  gutenberg: ["Alice", "Candide", "كتاب"],
  wikisource: ["Alice", "Candide", "مقدمة"],
  openlibrary: ["Abroad", "Madame Bovary", "ألف ليلة"],
  archive: ["Abroad", "Madame Bovary", "ألف ليلة"],
  doab: ["history", "histoire", "تاريخ"],
  oapen: ["history", "histoire", "تاريخ"],
  gallica: [null, "Germinal", null],
  openiti: [null, null, "الغزالي"],
};
for (const [source, terms] of Object.entries(queries)) {
  for (const [index, language] of ["en", "fr", "ar"].entries()) {
    if (terms[index] === null) continue;
    let book;
    await check(source, `${language} search`, async () => {
      const result = await searchCatalog({
        source,
        language,
        q: terms[index],
        page: 1,
      });
      book = result.books[0];
      if (result.errors.length) throw new Error(JSON.stringify(result.errors));
      return {
        count: result.sources.reduce((n, s) => n + s.count, 0),
        books: result.books
          .slice(0, 3)
          .map((b) => ({ id: b.id, title: b.title })),
      };
    });
    if (book)
      await check(source, `${language} first result reader`, async () => {
        const data = await getContent(book.id, { language });
        return {
          id: book.id,
          title: book.title,
          type: data.type,
          chars: data.text?.length,
          chapters: data.chapters?.length,
          format: data.format,
          message: data.message,
          status: data.type === "source" ? "unavailable" : "pass",
        };
      });
  }
}
await check("archive", "restricted edition remains unavailable", async () => {
  const data = await getContent("archive:norwegianwood0000mura");
  if (data.type !== "source")
    throw new Error("Restricted edition incorrectly marked readable");
  return { type: data.type, message: data.message };
});
await check("archive", "actual scanned PDF bytes", async () => {
  const result = await getReaderFileChunk(
    "abroadcranethoma00craniala",
    "abroadcranethoma00craniala.pdf",
    0,
    65535,
  );
  const signature = result.bytes.subarray(0, 5).toString();
  if (signature !== "%PDF-") throw new Error("PDF signature missing");
  return { bytes: result.bytes.length, total: result.size, signature };
});
await check('hindawi', 'advertised Arabic PDF reader import', async () => {
  const data = await getContent('hindawi:86869064');
  return { type: data.type, format: data.format, status: data.type === 'remote' ? 'pass' : 'unavailable' };
});
await check('standardebooks', 'individual EPUB reader import', async () => {
  const data = await getContent('standardebooks:jane-austen/pride-and-prejudice');
  return { type: data.type, format: data.format, status: data.type === 'remote' ? 'pass' : 'unavailable' };
});
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/source-audit-1.5.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      scope:
        `All ${sourceDirectory.length} listed sources; representative searches and books, not every catalogue record.`,
      checks,
    },
    null,
    2,
  ),
);
console.log(
  `Audit saved: ${checks.length} checks, ${checks.filter((c) => c.status === "fail").length} failures.`,
);
