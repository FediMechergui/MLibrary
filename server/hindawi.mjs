import { PDFDocument } from "pdf-lib";
import { readBytes } from "./openaccess.mjs";

const copies = new Map(),
  pending = new Map();
const LIMIT = 32 * 1024 * 1024,
  CACHE_LIMIT = 64 * 1024 * 1024;
let used = 0,
  cooldown = 0,
  queue = Promise.resolve();
export function hindawiId(id) {
  if (!/^\d{8}$/.test(id)) throw new Error("Invalid Safahat book identifier");
  return id;
}
export function hindawiLink(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid Safahat book link");
  }
  const page = [
    "www.safahat.org",
    "safahat.org",
    "www.hindawi.org",
    "hindawi.org",
  ].includes(url.hostname);
  const match = (
    page ? /^\/books\/(\d{8})\/?$/ : /^\/books\/(\d{8})\.pdf$/
  ).exec(url.pathname);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    /\\|%2e|%2f|%5c/i.test(value) ||
    (!page && url.hostname !== "downloads.hindawi.org") ||
    !match
  )
    throw new Error("Invalid Safahat book link");
  return hindawiId(match[1]);
}
export async function hindawiEdition(id) {
  hindawiId(id);
  const cached = copies.get(id);
  if (cached && cached.until > Date.now()) return cached;
  if (pending.has(id)) return pending.get(id);
  if (pending.size >= 3)
    throw Object.assign(
      new Error("The publisher download queue is full. Try again shortly."),
      { status: 429 },
    );
  const task = download(id);
  pending.set(id, task);
  try {
    return await task;
  } finally {
    pending.delete(id);
  }
}
async function download(id) {
  queue = queue
    .catch(() => {})
    .then(async () => {
      if (cooldown > Date.now())
        throw Object.assign(
          new Error("Safahat is limiting requests. Try again later."),
          { status: 429 },
        );
      await new Promise((resolve) => setTimeout(resolve, 1200));
    });
  await queue;
  // The publisher advertises this public PDF server on its ordinary book pages.
  // Request the complete file; do not solve challenges or fall back to restricted EPUBs.
  const response = await fetch(
    `https://downloads.hindawi.org/books/${id}.pdf`,
    {
      redirect: "error",
      signal: AbortSignal.timeout(25000),
      headers: {
        "User-Agent":
          "MLibrary/1.1 (https://github.com/FediMechergui/MLibrary)",
      },
    },
  );
  if (response.status !== 200) {
    if (response.status === 429)
      cooldown =
        Date.now() +
        Math.max(
          60000,
          Math.min(
            3600000,
            (Number(response.headers.get("retry-after")) || 60) * 1000,
          ),
        );
    await response.body?.cancel();
    throw Object.assign(new Error(`Safahat PDF returned ${response.status}`), {
      status: response.status,
    });
  }
  const bytes = await readBytes(response, LIMIT);
  const length = Number(response.headers.get("content-length"));
  if (
    bytes.subarray(0, 5).toString() !== "%PDF-" ||
    (length && length !== bytes.length)
  )
    throw new Error("The publisher did not return a complete PDF book");
  let pdf;
  try {
    pdf = await PDFDocument.load(bytes, {
      updateMetadata: false,
      throwOnInvalidObject: true,
    });
  } catch {
    throw new Error(
      "This PDF is encrypted or cannot be read. Import a readable publisher copy.",
    );
  }
  if (!pdf.getPageCount()) throw new Error("The PDF contains no pages");
  const clean = (value) =>
    (value || "")
      .replace(/[\u0000-\u001f]/g, " ")
      .trim()
      .slice(0, 600);
  const sourceUrl = `https://www.safahat.org/books/${id}/`;
  const rights =
    "Publisher-provided public PDF. Copyright and permission notices remain in the original file.";
  const book = {
    id: `hindawi:${id}`,
    source: "hindawi",
    sourceUrl,
    title: clean(pdf.getTitle()) || `Safahat · ${id}`,
    authors: pdf.getAuthor() ? [clean(pdf.getAuthor())] : [],
    language: "ar",
    languages: ["ar"],
    cover: null,
    subjects: pdf.getSubject() ? [clean(pdf.getSubject())] : [],
    description: "The complete publisher PDF, downloaded into your reader.",
    access: "read",
    formats: ["PDF"],
    rights,
  };
  const value = {
    book,
    bytes,
    until: Date.now() + 1800000,
    content: {
      type: "remote",
      format: "pdf",
      url: `https://downloads.hindawi.org/books/${id}.pdf`,
      sourceUrl,
      attribution: `Hindawi / Safahat · ${rights}`,
      file: { source: "hindawi", id, format: "pdf" },
    },
  };
  if (copies.has(id)) {
    used -= copies.get(id).bytes.length;
    copies.delete(id);
  }
  while (copies.size && used + bytes.length > CACHE_LIMIT) {
    const first = copies.keys().next().value;
    used -= copies.get(first).bytes.length;
    copies.delete(first);
  }
  copies.set(id, value);
  used += bytes.length;
  return value;
}
export async function hindawiFileChunk(id, start, end) {
  hindawiId(id);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    end - start >= 1024 * 1024
  )
    throw new Error("Invalid reader file range");
  const { bytes } = await hindawiEdition(id);
  if (start >= bytes.length) throw new Error("Invalid reader file range");
  return { bytes: bytes.subarray(start, end + 1), size: bytes.length };
}
