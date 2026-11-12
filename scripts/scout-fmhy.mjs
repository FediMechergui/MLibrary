// Bounded discovery probes; this script does not ingest books or solve challenges.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { DOMParser } from "linkedom";

const filesOnly = process.argv.includes("--files-only");
const report = filesOnly
  ? JSON.parse(await readFile("artifacts/fmhy-scout.json", "utf8"))
  : {
      checkedAt: new Date().toISOString(),
      environment: "Local Node HTTPS, without accounts or challenge cookies",
      checks: [],
    };
const bodies = new Map();
async function probe(
  name,
  url,
  accept = "text/html,application/json;q=0.9,*/*;q=0.5",
) {
  const start = Date.now();
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "MLibrarySourceScout/1.0 (+https://github.com/FediMechergui/MLibrary)",
        Accept: accept,
      },
      signal: AbortSignal.timeout(25000),
    });
    const reader = response.body?.getReader(),
      chunks = [];
    let bytes = 0,
      truncated = false;
    if (reader)
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 4 * 1024 * 1024) {
          truncated = true;
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    const body = Buffer.concat(chunks).toString("utf8");
    const challenge =
      /just a moment|cf-chl-|verify you are human|challenge-platform|ddos-guard|access denied/i.test(
        body.slice(0, 15000),
      );
    const item = {
      name,
      url,
      finalUrl: response.url,
      status: response.status,
      contentType: response.headers.get("content-type"),
      bytes,
      truncated,
      challenge,
      milliseconds: Date.now() - start,
    };
    if (
      /application\/(?:atom\+xml|xml)|text\/xml/.test(item.contentType || "")
    ) {
      const doc = new DOMParser().parseFromString(body, "application/xml");
      const entries = [...doc.getElementsByTagName("entry")];
      item.feed = {
        title: doc.querySelector("feed > title")?.textContent,
        entries: entries.length,
        total:
          doc.getElementsByTagName("opensearch:totalResults")[0]?.textContent ||
          doc.getElementsByTagName("totalResults")[0]?.textContent,
        samples: entries.slice(0, 3).map((e) => ({
          id: e.querySelector("id")?.textContent,
          title: e.querySelector("title")?.textContent,
          language: (
            e.getElementsByTagName("dcterms:language")[0] ||
            e.getElementsByTagName("dc:language")[0] ||
            e.getElementsByTagName("language")[0]
          )?.textContent.trim(),
          links: [...e.querySelectorAll("link")].map((l) => ({
            rel: l.getAttribute("rel"),
            type: l.getAttribute("type"),
            url: new URL(
              l.getAttribute("href").replaceAll("&amp;", "&"),
              response.url,
            ).href,
            license: l.getAttribute("dcterms:rights") || undefined,
          })),
          rights: e.querySelector("rights")?.textContent,
        })),
        navigation: [...doc.querySelectorAll("feed > link")].map((l) => ({
          rel: l.getAttribute("rel"),
          url: new URL(
            l.getAttribute("href").replaceAll("&amp;", "&"),
            response.url,
          ).href,
        })),
      };
    }
    if (item.contentType?.includes("json")) {
      try {
        const data = JSON.parse(body);
        item.jsonFields = Object.keys(data);
        item.apiError = data.error || data.message;
      } catch {}
    }
    report.checks.push(item);
    bodies.set(name, body);
    console.log(JSON.stringify(item));
    return item;
  } catch (error) {
    const item = {
      name,
      url,
      error: error.message,
      cause: error.cause?.code,
      milliseconds: Date.now() - start,
    };
    report.checks.push(item);
    console.log(JSON.stringify(item));
    return item;
  }
}

if (!filesOnly) {
  await probe("Open SLUM status page", "https://open-slum.org/");
  const anna = await probe("Anna home", "https://annas-archive.gl/");
  if (anna.status === 200 && !anna.challenge) {
    await probe(
      "Anna English metadata search",
      "https://annas-archive.gl/search?lang=en&q=Pride%20and%20Prejudice",
    );
    await probe(
      "Anna French metadata search",
      "https://annas-archive.gl/search?lang=fr&q=Les%20Argonautes",
    );
    await probe(
      "Anna Arabic metadata search",
      "https://annas-archive.gl/search?lang=ar&q=" +
        encodeURIComponent("نجيب محفوظ"),
    );
  } else
    report.checks.push({
      name: "Anna search",
      status: "not attempted",
      reason:
        "Ordinary home request unavailable/challenged; no challenge workarounds attempted.",
    });
  await probe(
    "Anna documented download API, without credentials",
    "https://annas-archive.gl/dyn/api/fast_download.json",
    "application/json",
  );
  await probe(
    "Unglue.it OPDS",
    "https://unglue.it/api/opds/",
    "application/atom+xml;profile=opds-catalog;kind=acquisition",
  );
  await probe(
    "Unglue.it EPUB excluding Gutenberg and DOAB",
    "https://unglue.it/api/opds/epub/-gtbg/-doab/?page=1",
    "application/atom+xml",
  );
  await probe(
    "Unglue.it French title query",
    "https://unglue.it/api/opds/s.mis%C3%A9rables/",
    "application/atom+xml",
  );
  await probe("Faded Page catalogue", "https://www.fadedpage.com/allbooks.php");
  await probe("Global Grey home", "https://www.globalgreyebooks.com/");
}
// Actual bytes, not merely a successful book-detail page. No complete books are saved.
async function probeFile(name, url) {
  const start = Date.now();
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "MLibrarySourceScout/1.0 (+https://github.com/FediMechergui/MLibrary)",
        Range: "bytes=0-65535",
      },
      signal: AbortSignal.timeout(25000),
    });
    const reader = response.body.getReader(),
      chunks = [];
    let size = 0;
    try {
      while (size < 65536) {
        const { done, value } = await reader.read();
        if (done) break;
        const part = value.subarray(0, 65536 - size);
        chunks.push(part);
        size += part.length;
      }
    } finally {
      await reader.cancel();
    }
    const bytes = Buffer.concat(chunks),
      zip = bytes.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]));
    const item = {
      name,
      url,
      finalUrl: response.url,
      status: response.status,
      contentType: response.headers.get("content-type"),
      contentRange: response.headers.get("content-range"),
      sampledBytes: size,
      zipHeader: zip,
      epubMime: zip && bytes.includes(Buffer.from("application/epub+zip")),
      milliseconds: Date.now() - start,
    };
    report.checks.push(item);
    console.log(JSON.stringify(item));
  } catch (error) {
    const item = {
      name,
      url,
      error: error.message,
      cause: error.cause?.code,
      milliseconds: Date.now() - start,
    };
    report.checks.push(item);
    console.log(JSON.stringify(item));
  }
}
await probeFile(
  "Faded Page English EPUB: Flatland",
  "https://www.fadedpage.com/link.php?file=20140519.epub",
);
await probeFile(
  "Faded Page French EPUB: Le Feu sous la Cendre",
  "https://www.fadedpage.com/link.php?file=20220141.epub",
);
await probeFile(
  "Unglue.it French EPUB: Le temps des loups",
  "https://unglue.it/download_ebook/2468/?feed=opds",
);
await probeFile(
  "Unglue.it English EPUB: Mapping and the Citizen Sensor",
  "https://unglue.it/download_ebook/384540/?feed=opds",
);
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/fmhy-scout.json",
  JSON.stringify(report, null, 2) + "\n",
);
await mkdir(".cache/fmhy-scout", { recursive: true });
for (const [name, body] of bodies)
  await writeFile(
    ".cache/fmhy-scout/" +
      name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() +
      ".txt",
    body,
  );
