import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { parseHTML } from "linkedom";
import {
  communitySources,
  communityId,
  origins,
  pageUrl,
  baseBook,
  parseUnglue,
  clean,
} from "./community-parsers.mjs";

let snapshot;
const editions = new Map(),
  files = new Map(),
  pending = new Map();
const MAX = 50 * 1024 * 1024;
function data() {
  return (snapshot ||= JSON.parse(
    gunzipSync(readFileSync("server/data/community.json.gz")),
  ));
}
const normalize = (s) =>
  s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
export function searchCommunity({
  source,
  q = "",
  language = "all",
  page = 1,
}) {
  const terms = normalize(q).split(/\s+/).filter(Boolean);
  const records = data().records.filter(
    (b) =>
      b.source === source &&
      (language === "all" || b.languages.includes(language)) &&
      terms.every((t) =>
        normalize(`${b.title} ${b.authors.join(" ")}`).includes(t),
      ),
  );
  return {
    source,
    count: records.length,
    hasMore: page * 24 < records.length,
    updatedAt: data().updatedAt,
    books: records
      .slice((page - 1) * 24, page * 24)
      .map(({ files, ...book }) => book),
  };
}
export function communityStatus() {
  return { updatedAt: data().updatedAt, sources: data().report };
}
export function allowedCommunityUrl(source, value) {
  try {
    const u = new URL(value);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.port ||
      /%2e|%2f|%5c/i.test(u.pathname)
    )
      return false;
    if (source === "unglue")
      return (
        (u.hostname === "unglue.it" &&
          /^\/(?:api\/opds\/(?:all|epub|pdf)\/|work\/\d+\/(?:download\/)?|download_ebook\/\d+\/)$/.test(
            u.pathname,
          )) ||
        (u.hostname === "files.unglue.it" &&
          /^\/ebf\/[a-f\d]+\.(epub|pdf)$/.test(u.pathname))
      );
    if (source === "fadedpage")
      return (
        u.origin === origins.fadedpage &&
        ["/showbook.php", "/link.php"].includes(u.pathname)
      );
    if (source === "globalgrey")
      return (
        u.origin === origins.globalgrey &&
        (/^\/(?:book-page\/)?[a-z0-9-]+-ebook\.html$/.test(u.pathname) ||
          /^\/ebooks(?:-\d+)?\/[a-z0-9_./-]+\.(epub|pdf)$/.test(u.pathname))
      );
    return false;
  } catch {
    return false;
  }
}
async function bytes(response, max) {
  if (Number(response.headers.get("content-length")) > max) {
    await response.body?.cancel();
    throw new Error("This publisher file exceeds the 50 MB import limit");
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > max)
      throw new Error("Publisher response exceeds the download limit");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function upstream(source, value, headers = {}) {
  let url = value;
  for (let hop = 0; hop < 5; hop++) {
    if (!allowedCommunityUrl(source, url))
      throw new Error(
        "This publisher hosts the file outside the supported download service. Open its page to download and import the edition.",
      );
    const r = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(25000),
      headers: {
        "User-Agent":
          "MLibrary/1.6 (+https://github.com/FediMechergui/MLibrary)",
        ...headers,
      },
    });
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      const location = r.headers.get("location");
      await r.body?.cancel();
      if (!location) throw new Error("Publisher redirect missing");
      const next = new URL(location, url);
      if (next.origin !== new URL(url).origin) {
        delete headers.Cookie;
        delete headers.Referer;
      }
      url = next.href;
      continue;
    }
    if (!r.ok) {
      await r.body?.cancel();
      throw Object.assign(new Error(`Source returned ${r.status}`), {
        status: r.status,
      });
    }
    return r;
  }
  throw new Error("Too many publisher redirects");
}
export async function communityEdition(source, id) {
  communityId(source, id);
  const key = `${source}:${id}`,
    cached = editions.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const indexed = data().records.find((b) => b.id === key);
  let book,
    downloads,
    cookie = "";
  if (source === "unglue") {
    if (indexed?.files?.length) {
      ({ files: downloads, ...book } = indexed);
    } else {
      // Without the EPUB facet the service returns a single, sometimes MOBI-only,
      // acquisition even when the same work has a public EPUB edition.
      const r = await upstream(
        source,
        `${origins.unglue}/api/opds/epub/?work=${id}`,
      );
      const parsed = parseUnglue(
        (await bytes(r, 2 * 1024 * 1024)).toString("utf8"),
        { requireFiles: false },
      );
      const record = parsed.records.find((b) => b.id === key);
      if (!record)
        throw new Error(
          "This Unglue.it edition has no public EPUB/PDF in a supported language",
        );
      ({ files: downloads, ...book } = record);
      if (!downloads.length) {
        const page = await upstream(source, `${pageUrl(source, id)}download/`);
        const { document: d } = parseHTML(
          (await bytes(page, 2 * 1024 * 1024)).toString("utf8"),
        );
        downloads = [
          ...d.querySelectorAll('a[href*="/download_ebook/"]'),
        ].flatMap((a) => {
          const label = `${a.textContent} ${a.getAttribute("type") || ""} ${a.getAttribute("title") || ""}`;
          const format = /epub/i.test(label)
            ? "epub"
            : /pdf/i.test(label)
              ? "pdf"
              : null;
          const u = new URL(a.getAttribute("href"), origins.unglue);
          return format && allowedCommunityUrl(source, u.href)
            ? [{ url: u.href, format }]
            : [];
        });
        if (!downloads.length)
          throw new Error(
            "This edition has no advertised public EPUB/PDF. Choose another edition or import a publisher copy.",
          );
        book.formats = [
          ...new Set(downloads.map((f) => f.format.toUpperCase())),
        ];
      }
    }
  } else {
    let r;
    try {
      r = await upstream(source, indexed?.sourceUrl || pageUrl(source, id));
    } catch (e) {
      if (source !== "globalgrey" || e.status !== 404) throw e;
      r = await upstream(source, pageUrl(source, id));
    }
    cookie = r.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const { document: d } = parseHTML(
      (await bytes(r, 2 * 1024 * 1024)).toString("utf8"),
    );
    if (source === "fadedpage") {
      const rows = [...d.querySelectorAll('table[summary="details"] tr')];
      const field = (name) =>
        rows.find(
          (row) => row.firstElementChild?.textContent.trim() === `${name}:`,
        )?.children[1];
      const title = field("Title")?.textContent;
      if (!title) throw new Error("Faded Page book metadata unavailable");
      book = baseBook(
        source,
        id,
        title,
        [
          ...(field("Author")?.querySelectorAll('a[href*="author="]') || []),
        ].map((a) => a.textContent),
        indexed?.language ||
          { French: "fr", Arabic: "ar", English: "en" }[
            field("Language")?.textContent.trim()
          ] ||
          "en",
      );
      book.description = clean(field("Description")?.textContent || "").slice(
        0,
        700,
      );
      downloads = [...d.querySelectorAll('a[href^="link.php?file="]')].flatMap(
        (a) => {
          const u = new URL(a.getAttribute("href"), origins.fadedpage),
            name = u.searchParams.get("file");
          return new RegExp(`^${id}(?:-a5)?\\.(epub|pdf)$`).test(name)
            ? [{ url: u.href, format: name.endsWith(".epub") ? "epub" : "pdf" }]
            : [];
        },
      );
    } else {
      const title = d.querySelector("h1")?.textContent;
      if (!title) throw new Error("Global Grey book metadata unavailable");
      const authors = [...d.querySelectorAll(".book-byline a")].map(
        (a) => a.textContent,
      );
      book = baseBook(
        source,
        id,
        title,
        authors.length ? authors : indexed?.authors || [],
        "en",
      );
      book.sourceUrl = r.url || indexed?.sourceUrl || pageUrl(source, id);
      book.cover =
        d.querySelector(".book-cover img")?.getAttribute("src") ||
        indexed?.cover ||
        null;
      downloads = [...d.querySelectorAll("a[href]")].flatMap((a) => {
        const u = new URL(a.getAttribute("href"), origins.globalgrey);
        return /\.(epub|pdf)$/.test(u.pathname) &&
          allowedCommunityUrl(source, u.href)
          ? [
              {
                url: u.href,
                format: u.pathname.endsWith(".epub") ? "epub" : "pdf",
              },
            ]
          : [];
      });
    }
    if (!downloads.length)
      throw new Error(
        "The publisher has no supported public EPUB or PDF for this edition",
      );
    book.formats = [...new Set(downloads.map((f) => f.format.toUpperCase()))];
  }
  const value = { book, downloads, cookie };
  if (editions.size >= 64) editions.delete(editions.keys().next().value);
  editions.set(key, { expires: Date.now() + 300000, value });
  return value;
}
export async function communityContent(source, id, format = "auto") {
  const { book, downloads } = await communityEdition(source, id);
  const file =
    format === "auto"
      ? downloads.find((f) => f.format === "epub") || downloads[0]
      : downloads.find((f) => f.format === format);
  if (!file)
    return {
      type: "source",
      available: false,
      reason: "format",
      url: book.sourceUrl,
      message:
        "Choose Automatic to read this edition in one of its available formats.",
      attribution: book.rights,
    };
  return {
    type: "remote",
    format: file.format,
    url: file.url,
    sourceUrl: book.sourceUrl,
    attribution: book.rights,
    file: { source, id, format: file.format },
  };
}
export async function communityFileChunk(source, id, format, start, end) {
  communityId(source, id);
  if (
    !["epub", "pdf"].includes(format) ||
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    end - start >= 1024 * 1024
  )
    throw new Error("Invalid reader file range");
  const key = `${source}:${id}:${format}`;
  let cached = files.get(key);
  if (cached?.expires < Date.now()) {
    files.delete(key);
    cached = null;
  }
  if (!cached) {
    let job = pending.get(key);
    if (!job) {
      if (pending.size >= 2)
        throw Object.assign(
          new Error("Publisher download queue is busy. Retry shortly."),
          { status: 429 },
        );
      job = (async () => {
        const { book, downloads, cookie } = await communityEdition(source, id);
        const file = downloads.find((f) => f.format === format);
        if (!file) throw new Error("No publicly accessible reader file");
        const r = await upstream(source, file.url, {
          ...(cookie ? { Cookie: cookie } : {}),
          Referer: book.sourceUrl,
          "Accept-Encoding": "identity",
        });
        if (/text\/html/.test(r.headers.get("content-type") || "")) {
          await r.body.cancel();
          throw new Error(
            "Publisher returned a webpage instead of a book. Open the source and complete any verification before importing.",
          );
        }
        const buffer = await bytes(r, MAX);
        if (
          format === "pdf"
            ? buffer.subarray(0, 5).toString() !== "%PDF-"
            : buffer.subarray(0, 4).toString("hex") !== "504b0304"
        )
          throw new Error("Publisher did not return a valid book file");
        const length = Number(r.headers.get("content-length"));
        if (length && buffer.length !== length)
          throw new Error("Incomplete publisher download");
        let total = [...files.values()].reduce(
          (n, f) => n + f.buffer.length,
          0,
        );
        while (
          files.size &&
          (files.size >= 4 || total + buffer.length > 96 * 1024 * 1024)
        ) {
          const first = files.keys().next().value;
          total -= files.get(first).buffer.length;
          files.delete(first);
        }
        const value = { buffer, expires: Date.now() + 180000 };
        files.set(key, value);
        return value;
      })().finally(() => pending.delete(key));
      pending.set(key, job);
    }
    cached = await job;
  }
  if (start >= cached.buffer.length)
    throw new Error("Invalid reader file range");
  return {
    bytes: cached.buffer.subarray(
      start,
      Math.min(end + 1, cached.buffer.length),
    ),
    size: cached.buffer.length,
  };
}
export const annaDomains = [
  "annas-archive.gd",
  "annas-archive.gl",
  "annas-archive.pk",
];
export function parseSourceMonitor(html) {
  const { document: d } = parseHTML(html);
  return annaDomains.map((domain) => {
    const a = [...d.querySelectorAll("a.domain-link")].find(
      (a) => a.getAttribute("href") === "https://" + domain,
    );
    const row = a?.closest("li");
    const status = row
      ? [...row.querySelectorAll("a,span")]
          .map((e) => e.textContent.trim())
          .find((t) => /^(PROTECTED|UP|DOWN)$/.test(t)) || "UNKNOWN"
      : "UNKNOWN";
    return { domain, status };
  });
}
let monitor;
export async function sourceMonitor() {
  if (monitor && Date.now() - monitor.time < 900000) return monitor.value;
  try {
    let target = "https://open-slum.org/",
      r;
    for (let hop = 0; hop < 3; hop++) {
      r = await fetch(target, {
        redirect: "manual",
        headers: {
          "User-Agent":
            "MLibrary/1.6 (+https://github.com/FediMechergui/MLibrary)",
          Accept: "text/html",
        },
        signal: AbortSignal.timeout(12000),
      });
      if (![301, 302, 303, 307, 308].includes(r.status)) break;
      const location = r.headers.get("location");
      await r.body?.cancel();
      const next = new URL(location || "", target);
      if (
        !location ||
        next.protocol !== "https:" ||
        next.username ||
        next.password ||
        next.port ||
        !["open-slum.org", "www.open-slum.org"].includes(next.hostname)
      )
        throw new Error("Monitor redirect unavailable");
      target = next.href;
    }
    if (!r.ok) {
      await r.body?.cancel();
      throw Object.assign(new Error("Monitor unavailable"), {
        status: r.status,
      });
    }
    const value = {
      checkedAt: new Date().toISOString(),
      url: "https://open-slum.org/",
      domains: parseSourceMonitor(
        (await bytes(r, 1024 * 1024)).toString("utf8"),
      ),
      note: "Availability reports do not prove books can be downloaded. PROTECTED means verification is required.",
    };
    monitor = { time: Date.now(), value };
    return value;
  } catch (error) {
    return {
      ...(monitor?.value || {
        domains: annaDomains.map((domain) => ({ domain, status: "UNKNOWN" })),
        checkedAt: null,
        url: "https://open-slum.org/",
      }),
      stale: true,
      reason: error.status
        ? `HTTP ${error.status}`
        : error.name === "TimeoutError"
          ? "timeout"
          : "connection",
    };
  }
}
