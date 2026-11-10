import { DOMParser } from "linkedom";
import { oapenId } from "./openaccess-catalog.mjs";

const repositories = {
  oapen: {
    host: "library.oapen.org",
    prefix: "20.500.12657",
    name: "OAPEN Library",
  },
  doab: {
    host: "directory.doabooks.org",
    prefix: "20.500.12854",
    name: "Directory of Open Access Books",
  },
};
const editions = new Map(),
  files = new Map(),
  queues = new Map(),
  cooldowns = new Map();
let fileBytes = 0;
const WHOLE_FILE_LIMIT = 32 * 1024 * 1024;
export function openAccessId(source, id) {
  if (!repositories[source] || !/^\d{1,10}$/.test(id))
    throw new Error("Invalid open-access edition");
  return id;
}
export function openAccessLink(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid open-access book link");
  }
  const source = Object.keys(repositories).find(
    (key) => repositories[key].host === url.hostname,
  );
  const match = /^\/handle\/(20\.500\.\d+)\/(\d{1,10})\/?$/.exec(url.pathname);
  if (
    !source ||
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !match ||
    match[1] !== repositories[source].prefix
  )
    throw new Error("Invalid open-access book link");
  return { source, id: match[2] };
}
export function approvedFile(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    url.hash
  )
    return null;
  url.protocol = "https:";
  if (url.pathname.includes("..") || /%(?:2e|2f|5c)/i.test(url.pathname))
    return null;
  if (
    url.hostname === "library.oapen.org" &&
    /^\/bitstream\/(?:handle\/)?20\.500\.12657\/\d{1,10}\//.test(url.pathname)
  )
    return url;
  if (
    url.hostname === "www.ledizioni.it" &&
    /^\/(?:stag\/)?wp-content\/uploads\/\d{4}\/\d{2}\/[^/]+\.(?:pdf|epub)$/i.test(
      url.pathname,
    ) &&
    !url.search
  )
    return url;
  return null;
}
// Serialize starts per host and respect throttling. No proxy/IP rotation or challenge solving.
async function pacedFetch(url, options = {}) {
  const host = new URL(url).hostname;
  const previous = queues.get(host) || Promise.resolve();
  const turn = previous
    .catch(() => {})
    .then(async () => {
      if ((cooldowns.get(host) || 0) > Date.now())
        throw Object.assign(
          new Error("The source is limiting requests. Please try again later."),
          { status: 429 },
        );
      await new Promise((resolve) =>
        setTimeout(resolve, host === "library.oapen.org" ? 5000 : 1200),
      );
    });
  queues.set(host, turn);
  await turn;
  const response = await fetch(url, {
    ...options,
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
    headers: {
      "User-Agent": "MLibrary/1.0 (https://github.com/FediMechergui/MLibrary)",
      ...options.headers,
    },
  });
  if (response.status === 429) {
    const retry = Number(response.headers.get("retry-after"));
    cooldowns.set(
      host,
      Date.now() + Math.max(30000, Math.min(3600000, (retry || 60) * 1000)),
    );
  }
  return response;
}
async function checkedResponse(response) {
  if (!response.ok) {
    await response.body?.cancel();
    throw Object.assign(new Error(`Source returned ${response.status}`), {
      status: response.status,
    });
  }
  return response;
}
export async function readBytes(response, limit) {
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel();
    throw new Error(
      "This file exceeds the supported download size. Import a publisher copy from your device.",
    );
  }
  const reader = response.body.getReader(),
    parts = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit)
        throw new Error("Source response exceeds the download limit");
      parts.push(value);
    }
    return Buffer.concat(parts);
  } finally {
    await reader.cancel().catch(() => {});
  }
}
async function downloadResponse(value, headers = {}) {
  let url = approvedFile(value);
  if (!url) throw new Error("Unsupported open-access download host or path");
  for (let redirect = 0; redirect < 4; redirect++) {
    const response = await pacedFetch(url, { headers });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      const next = location && approvedFile(new URL(location, url).href);
      if (!next || next.hostname !== url.hostname)
        throw new Error("Unsupported publisher redirect");
      url = next;
      continue;
    }
    return checkedResponse(response);
  }
  throw new Error("Too many publisher redirects");
}
function values(root, name) {
  return [...root.getElementsByTagName(name)]
    .map((e) => e.textContent.trim())
    .filter(Boolean);
}
function fields(root, path) {
  let nodes = [root];
  for (const name of path.split("."))
    nodes = nodes.flatMap((node) =>
      [...node.children].filter(
        (child) =>
          child.localName === "element" && child.getAttribute("name") === name,
      ),
    );
  return nodes
    .flatMap((node) =>
      [...node.getElementsByTagName("field")]
        .filter((f) => f.getAttribute("name") === "value")
        .map((f) => f.textContent.trim()),
    )
    .filter(Boolean);
}
export function parseOpenAccessRecord(source, id, xml) {
  openAccessId(source, id);
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error("Unsupported metadata declaration");
  const document = new DOMParser().parseFromString(xml, "text/xml");
  if (document.getElementsByTagName("error").length)
    throw Object.assign(new Error("This repository record is unavailable"), {
      status: 404,
    });
  const record = document.getElementsByTagName("record")[0];
  if (
    !record ||
    record.getElementsByTagName("header")[0]?.getAttribute("status") ===
      "deleted"
  )
    throw Object.assign(new Error("This repository record was deleted"), {
      status: 404,
    });
  const repo = repositories[source];
  const identifier = record
    .getElementsByTagName("header")[0]
    ?.getElementsByTagName("identifier")[0]?.textContent;
  if (identifier !== `oai:${repo.host}:${repo.prefix}/${id}`)
    throw new Error("Repository returned a different edition");
  const root = [...record.getElementsByTagName("metadata")].find((e) =>
    [...e.children].some(
      (c) => c.localName === "element" && c.getAttribute("name") === "dc",
    ),
  );
  const get = (dc, xoai) =>
    source === "oapen" ? fields(root, xoai) : values(record, dc);
  if (source === "oapen" && !root)
    throw new Error("Repository metadata is incomplete");
  const title = get("dc:title", "dc.title.none")[0];
  const rights = get("dc:rights", "dc.rights");
  const licenses =
    source === "doab"
      ? [...record.getElementsByTagName("oaire:licenseCondition")].map(
          (e) => e.getAttribute("uri") || e.textContent.trim(),
        )
      : [...root.getElementsByTagName("element")]
          .filter(
            (e) =>
              e.getAttribute("name") === "bundle" &&
              [...e.children].some(
                (f) =>
                  f.localName === "field" &&
                  f.getAttribute("name") === "name" &&
                  f.textContent === "ORIGINAL",
              ),
          )
          .flatMap((e) =>
            [...e.getElementsByTagName("field")]
              .filter((f) =>
                ["rightsuri", "rights"].includes(f.getAttribute("name")),
              )
              .map((f) => f.textContent.trim()),
          );
  const open = [...rights, ...licenses].some((r) =>
    /^(?:info:eu-repo\/semantics\/openAccess|open access|CC[ -]BY(?:[- ][A-Z]+)*|https?:\/\/creativecommons\.org\/(?:licenses|publicdomain)\/[^\s]+)$/i.test(
      r,
    ),
  );
  if (!title) throw new Error("Repository metadata has no title");
  const languages = get("dc:language", "dc.language").map(
    (l) => ({ eng: "en", fra: "fr", fre: "fr", ara: "ar" })[l] || l,
  );
  const book = {
    id: `${source}:${id}`,
    source,
    title,
    authors: get("dc:creator", "dc.contributor.author"),
    language: languages[0] || "und",
    languages,
    sourceUrl: `https://${repo.host}/handle/${repo.prefix}/${id}`,
    cover: null,
    subjects: get("dc:subject", "dc.subject").slice(0, 8),
    description: get("dc:description", "dc.description.abstract")
      .join(" ")
      .slice(0, 1200),
    rights: [...new Set([...licenses, ...rights])].join(" · "),
    access: "source",
    formats: [],
  };
  const downloads = [];
  if (open && source === "oapen") {
    for (const element of root.getElementsByTagName("element")) {
      if (element.getAttribute("name") !== "bitstream") continue;
      const data = Object.fromEntries(
        [...element.children]
          .filter((e) => e.localName === "field")
          .map((e) => [e.getAttribute("name"), e.textContent.trim()]),
      );
      const format = {
        "application/pdf": "pdf",
        "application/epub+zip": "epub",
        "text/plain": "text",
      }[data.format];
      const url = approvedFile(data.url);
      const size = Number(data.size);
      if (
        format &&
        url &&
        oapenId(url.href) === id &&
        Number.isSafeInteger(size) &&
        size > 0
      )
        downloads.push({ format, url: url.href, size });
    }
  } else if (open) {
    for (const value of values(record, "dc:identifier")) {
      const url = approvedFile(value);
      if (url && /\.(pdf|epub)$/i.test(url.pathname))
        downloads.push({
          format: /\.epub$/i.test(url.pathname) ? "epub" : "pdf",
          url: url.href,
        });
    }
  }
  book.formats = [
    ...new Set(downloads.map((file) => file.format.toUpperCase())),
  ];
  return { book, downloads, open };
}
export async function openAccessEdition(source, id) {
  openAccessId(source, id);
  const key = `${source}:${id}`,
    cached = editions.get(key);
  if (cached?.until > Date.now()) return cached.value;
  const repo = repositories[source];
  const url = new URL(`https://${repo.host}/oai/request`);
  url.search = new URLSearchParams({
    verb: "GetRecord",
    metadataPrefix: source === "oapen" ? "xoai" : "oai_dc",
    identifier: `oai:${repo.host}:${repo.prefix}/${id}`,
  });
  const xml = (
    await readBytes(
      await checkedResponse(await pacedFetch(url)),
      2 * 1024 * 1024,
    )
  ).toString("utf8");
  const edition = parseOpenAccessRecord(source, id, xml);
  if (source === "doab" && edition.open) {
    const linkedId = edition.downloads
      .map((file) => oapenId(file.url))
      .find(Boolean);
    if (linkedId) {
      const linked = await openAccessEdition("oapen", linkedId);
      if (
        linked.open &&
        linked.book.languages.some((l) => edition.book.languages.includes(l))
      ) {
        edition.downloads = linked.downloads;
        edition.book.formats = linked.book.formats;
      }
    }
  }
  if (editions.size >= 128) editions.delete(editions.keys().next().value);
  editions.set(key, { value: edition, until: Date.now() + 600000 });
  return edition;
}
export async function openAccessContent(source, id, format = "auto") {
  const edition = await openAccessEdition(source, id);
  const { book, downloads } = edition;
  const attribution = `${repositories[source].name} · ${book.rights}`;
  const text = downloads.find(
    (file) => file.format === "text" && file.size <= 4 * 1024 * 1024,
  );
  if ((format === "auto" || format === "text") && text) {
    const bytes = await readBytes(
      await downloadResponse(text.url),
      4 * 1024 * 1024,
    );
    const body = bytes.toString("utf8");
    if (!body.trim() || /^\s*<(?:!doctype|html)/i.test(body))
      throw new Error("The repository did not return book text");
    return {
      type: "text",
      text: body,
      chapters: [],
      attribution,
      sourceUrl: book.sourceUrl,
    };
  }
  const file =
    downloads
      .filter((file) => file.format !== "text")
      .find((file) =>
        format === "auto" ? file.format === "epub" : file.format === format,
      ) ||
    (format === "auto"
      ? downloads.find((file) => file.format === "pdf")
      : undefined);
  if (!file)
    return {
      type: "source",
      available: false,
      reason: edition.open ? "no-file" : "restricted",
      url: book.sourceUrl,
      attribution,
      message:
        "No supported public file is available for this edition. Try another format, edition, or import your copy.",
    };
  return {
    type: "remote",
    format: file.format,
    url: file.url,
    sourceUrl: book.sourceUrl,
    attribution,
    file: { source, id, format: file.format },
  };
}
export async function openAccessFileChunk(source, id, format, start, end) {
  openAccessId(source, id);
  if (
    !["pdf", "epub"].includes(format) ||
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    end - start >= 1024 * 1024
  )
    throw new Error("Invalid reader file range");
  const edition = await openAccessEdition(source, id);
  const file = edition.downloads.find((file) => file.format === format);
  if (!edition.open || !file)
    throw new Error("No supported public file is available");
  const previous = files.get(file.url);
  if (previous && previous.until > Date.now()) {
    if (start >= previous.bytes.length)
      throw new Error("Invalid reader file range");
    return {
      bytes: previous.bytes.subarray(start, end + 1),
      size: previous.bytes.length,
    };
  }
  const response = await downloadResponse(file.url, {
    Range: `bytes=${start}-${end}`,
  });
  if (response.status === 206) {
    const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(
      response.headers.get("content-range") || "",
    );
    const size = Number(range?.[3]);
    if (
      !range ||
      Number(range[1]) !== start ||
      Number(range[2]) !== Math.min(end, size - 1) ||
      !Number.isSafeInteger(size) ||
      size <= start ||
      size > (format === "pdf" ? 500 : 50) * 1024 * 1024
    ) {
      await response.body?.cancel();
      throw new Error("Invalid publisher download range");
    }
    const bytes = await readBytes(response, Math.min(end + 1, size) - start);
    if (bytes.length !== Math.min(end + 1, size) - start)
      throw new Error("Incomplete publisher download");
    if (start === 0) validateSignature(bytes, format);
    return { bytes, size };
  }
  // OAPEN serves whole files without ranges. Cache a bounded complete file once;
  // expose small ranges to the app without repeatedly downloading the same PDF.
  const bytes = await readBytes(response, WHOLE_FILE_LIMIT);
  validateSignature(bytes, format);
  if ((file.size && bytes.length !== file.size) || start >= bytes.length)
    throw new Error("Incomplete publisher download");
  while (files.size && fileBytes + bytes.length > 64 * 1024 * 1024) {
    const first = files.keys().next().value;
    fileBytes -= files.get(first).bytes.length;
    files.delete(first);
  }
  if (files.has(file.url)) fileBytes -= files.get(file.url).bytes.length;
  files.set(file.url, { bytes, until: Date.now() + 600000 });
  fileBytes += bytes.length;
  return { bytes: bytes.subarray(start, end + 1), size: bytes.length };
}
function validateSignature(bytes, format) {
  if (
    format === "pdf"
      ? bytes.subarray(0, 5).toString() !== "%PDF-"
      : bytes[0] !== 80 || bytes[1] !== 75
  )
    throw new Error("The publisher did not return a valid book file");
}
