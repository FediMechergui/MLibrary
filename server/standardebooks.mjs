import { parseHTML } from "linkedom";
import { fetchUpstream, fetchWithRetry } from "./catalog.mjs";
const host = "https://standardebooks.org";
const cache = new Map();
export function standardPath(value) {
  if (
    typeof value !== "string" ||
    !/^[a-z0-9-]+\/[a-z0-9-]+(?:\/[a-z0-9-]+){0,4}$/.test(value) ||
    value.length > 240
  )
    throw new Error("Invalid Standard Ebooks edition");
  return value;
}
export function standardUrlPath(value) {
  const url = new URL(value);
  if (
    url.origin !== host ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.startsWith("/ebooks/")
  )
    throw new Error("Paste an individual Standard Ebooks book page URL.");
  return standardPath(url.pathname.slice(8).replace(/\/$/, ""));
}
export async function standardBook(path) {
  standardPath(path);
  const cached = cache.get(path);
  if (cached && cached.expires > Date.now()) return cached.value;
  const sourceUrl = `${host}/ebooks/${path}`;
  // No arbitrary redirects, credentials, feed crawling or authenticated OPDS.
  const response = await fetchUpstream(sourceUrl, {
    redirect: "error",
    headers: { Accept: "text/html" },
  });
  const html = await limitedBytes(response, 1024 * 1024);
  const { document } = parseHTML(html.toString("utf8"));
  const href = [...document.querySelectorAll("a.epub[href]")]
    .map((a) => a.getAttribute("href"))
    .find(
      (p) =>
        p.startsWith(`/ebooks/${path}/downloads/`) &&
        p.endsWith(".epub") &&
        !p.endsWith("_advanced.epub") &&
        !p.endsWith(".kepub.epub"),
    );
  if (!href)
    throw new Error(
      "This page does not offer a compatible public EPUB. Import a downloaded copy instead.",
    );
  const file = new URL(href, host);
  if (
    file.origin !== host ||
    !file.pathname.startsWith(`/ebooks/${path}/downloads/`) ||
    !/^[-a-z0-9_]+\.epub$/.test(file.pathname.split("/").pop())
  )
    throw new Error("Unsupported publisher download link");
  // The publisher's ordinary download button uses this query to deliver bytes,
  // while the same URL without it serves an HTML thank-you page.
  file.search = "source=download";
  const title = document
    .querySelector('h1[property="schema:name"]')
    ?.textContent.trim();
  if (!title) throw new Error("The publisher did not return book metadata");
  const authors = [
    ...document.querySelectorAll(
      '[property="schema:author"] [property="schema:name"]',
    ),
  ].map((e) => e.textContent.trim());
  const value = {
    book: {
      id: `standardebooks:${path}`,
      title,
      authors,
      language: "en",
      languages: ["en"],
      source: "standardebooks",
      sourceUrl,
      cover: `${sourceUrl}/downloads/cover.jpg`,
      subjects: [],
      description:
        "An individual Standard Ebooks edition, downloaded into your MLibrary reader.",
      access: "read",
      rights:
        "Standard Ebooks · Public-domain status based on US law; see the edition's rights statement.",
      formats: ["EPUB"],
    },
    content: {
      type: "remote",
      format: "epub",
      url: file.href,
      sourceUrl,
      attribution:
        "Standard Ebooks · CC0 for original contributions. Underlying work public-domain status is based on US law. Original edition and credits retained in the EPUB.",
    },
  };
  if (cache.size >= 64) cache.delete(cache.keys().next().value);
  cache.set(path, { expires: Date.now() + 300000, value });
  return value;
}
async function limitedBytes(response, limit) {
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new Error("Publisher response exceeds the download limit");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
export async function standardFileChunk(path, start, end) {
  standardPath(path);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    end - start >= 1024 * 1024
  )
    throw new Error("Invalid reader file range");
  const { content } = await standardBook(path);
  const response = await fetchWithRetry(content.url, {
    redirect: "error",
    headers: {
      Range: `bytes=${start}-${end}`,
      "User-Agent": "MLibrary/1.0 (https://github.com/FediMechergui/MLibrary)",
    },
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw Object.assign(new Error(`Source returned ${response.status}`), {
      status: response.status,
    });
  }
  const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(
    response.headers.get("content-range") || "",
  );
  const size = Number(range?.[3]);
  if (
    response.status !== 206 ||
    !range ||
    Number(range[1]) !== start ||
    Number(range[2]) !== Math.min(end, size - 1) ||
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    size > 50 * 1024 * 1024
  ) {
    await response.body?.cancel();
    throw new Error(
      "The publisher did not provide a valid EPUB download range",
    );
  }
  const bytes = await limitedBytes(
    response,
    Math.min(end, size - 1) - start + 1,
  );
  if (bytes.length !== Math.min(end, size - 1) - start + 1)
    throw new Error("The publisher returned an incomplete EPUB file");
  return { bytes, size };
}
