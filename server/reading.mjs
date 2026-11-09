import { fetchUpstream, fetchWithRetry } from "./catalog.mjs";

export const archiveIdentifier = /^[A-Za-z0-9][A-Za-z0-9._-]{0,179}$/;
const isTrue = (value) =>
  value === true || value === "true" || value === "1" || value === 1;
export function hasOpenLicense(metadata) {
  const rights = `${metadata.rights || ""} ${metadata.licenseurl || ""}`;
  return /public[ -]domain|creativecommons\.org\/(?:licenses|publicdomain)\//i.test(
    rights,
  );
}
export function publicFiles(data) {
  if (
    !data?.metadata ||
    data.is_dark ||
    isTrue(data.metadata["access-restricted-item"])
  )
    return [];
  return (data.files || []).filter(
    (file) =>
      !isTrue(file.private) &&
      typeof file.name === "string" &&
      !/[\/\\\x00-\x1f]/.test(file.name) &&
      !file.name.includes("..") &&
      !/encrypt|lcp|drm/i.test(file.format || ""),
  );
}
export async function archiveResponse(url, range) {
  let current = new URL(url);
  for (let redirects = 0; redirects < 5; redirects++) {
    if (
      current.protocol !== "https:" ||
      current.port ||
      current.username ||
      current.password ||
      !(
        current.hostname === "archive.org" ||
        current.hostname.endsWith(".archive.org")
      )
    )
      throw new Error("Unsupported archive download host");
    const response = await fetchWithRetry(current, {
      redirect: "manual",
      credentials: "omit",
      headers: {
        ...(range ? { Range: range } : {}),
        "User-Agent":
          "MLibrary/0.2 (https://github.com/FediMechergui/MLibrary)",
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location)
        throw new Error("The source download moved without a location");
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new Error(`Source returned ${response.status}`);
    return response;
  }
  throw new Error("Too many source redirects");
}
const fileMetadata = new Map();
export async function getReaderFileChunk(id, name, start, end) {
  if (
    !archiveIdentifier.test(id) ||
    id.includes("..") ||
    typeof name !== "string" ||
    !name ||
    name.includes("..") ||
    /[\/\\\x00-\x1f]/.test(name) ||
    name.length > 250 ||
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    end - start >= 1024 * 1024
  )
    throw new Error("Invalid reader file range");
  let cached = fileMetadata.get(id);
  if (!cached || cached.expires < Date.now()) {
    const data = await (
      await fetchUpstream(
        `https://archive.org/metadata/${encodeURIComponent(id)}`,
      )
    ).json();
    cached = { files: publicFiles(data), expires: Date.now() + 60000 };
    if (fileMetadata.size >= 128)
      fileMetadata.delete(fileMetadata.keys().next().value);
    fileMetadata.set(id, cached);
  }
  const file = cached.files.find(
    (f) =>
      f.name === name &&
      ["EPUB", "Text PDF", "Image Container PDF"].includes(f.format),
  );
  const size = Number(file?.size);
  if (
    !file ||
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    size > (file.format === "EPUB" ? 50 : 500) * 1024 * 1024 ||
    start >= size
  )
    throw new Error("No publicly accessible reader file");
  end = Math.min(end, size - 1);
  const response = await archiveResponse(
    `https://archive.org/download/${encodeURIComponent(id)}/${encodeURIComponent(name)}`,
    `bytes=${start}-${end}`,
  );
  if (
    response.status !== 206 ||
    response.headers.get("content-range") !== `bytes ${start}-${end}/${size}`
  ) {
    await response.body?.cancel();
    throw new Error("The source did not return the requested book pages");
  }
  const reader = response.body.getReader(),
    chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > end - start + 1) {
      await reader.cancel();
      throw new Error("Reader file range exceeds its limit");
    }
    chunks.push(value);
  }
  if (length !== end - start + 1)
    throw new Error("The source returned an incomplete book page range");
  return { bytes: Buffer.concat(chunks), size };
}
export async function resolveArchive(id, readText) {
  if (!archiveIdentifier.test(id) || id.includes(".."))
    throw new Error("Unsupported book identifier");
  const data = await (
    await fetchUpstream(
      `https://archive.org/metadata/${encodeURIComponent(id)}`,
    )
  ).json();
  const url = `https://archive.org/details/${encodeURIComponent(id)}`;
  if (!data.metadata || data.is_dark || data.error)
    return {
      type: "source",
      url,
      available: false,
      message: "This source has not provided a readable edition.",
      attribution: "Internet Archive",
    };
  const files = publicFiles(data);
  const attribution = `Internet Archive · ${data.metadata.title || id}. ${data.metadata.rights || data.metadata.licenseurl || "Availability is managed by the source library."}`;
  // Reading uses the files the provider offers publicly, retaining its rights
  // statement. Public availability does not relabel a work as public domain.
  if (files.length) {
    const text = files.find(
      (f) =>
        ["DjVuTXT", "Text", "Plain Text"].includes(f.format) &&
        Number(f.size) <= 4 * 1024 * 1024,
    );
    if (text) {
      const response = await archiveResponse(
        `https://archive.org/download/${encodeURIComponent(id)}/${encodeURIComponent(text.name)}`,
      );
      return {
        type: "text",
        text: await readText(response),
        chapters: [],
        sourceUrl: url,
        attribution,
      };
    }
    const file = ["EPUB", "Text PDF", "Image Container PDF"].flatMap((format) =>
      files.filter(
        (f) =>
          f.format === format &&
          Number(f.size) > 0 &&
          Number(f.size) <= (format === "EPUB" ? 50 : 500) * 1024 * 1024,
      ),
    )[0];
    if (file)
      return {
        type: "remote",
        format: file.format === "EPUB" ? "epub" : "pdf",
        url: `https://archive.org/download/${encodeURIComponent(id)}/${encodeURIComponent(file.name)}`,
        attribution,
        sourceUrl: url,
      };
  }
  return {
    type: "source",
    url,
    available: false,
    message:
      "This edition has no publicly downloadable reader file. Import your own EPUB, PDF, or text copy to read it here.",
    attribution,
  };
}
export async function resolveOpenLibrary(id, language, readText) {
  if (!/^OL[1-9]\d{0,12}W$/.test(id))
    throw new Error("Unsupported book identifier");
  const code = { en: "eng", fr: "fre", ar: "ara" }[language] || "eng";
  const url = new URL("https://openlibrary.org/search.json");
  url.search = new URLSearchParams({
    q: `key:/works/${id} language:${code}`,
    lang: language || "en",
    fields:
      "key,title,ia,ebook_access,editions,editions.key,editions.language,editions.ia,editions.ebook_access,availability",
    limit: "1",
  }).toString();
  const data = await (await fetchUpstream(url)).json();
  const work = data.docs?.[0];
  const editions = work?.editions?.docs || [];
  const valid = (value) =>
    typeof value === "string" &&
    archiveIdentifier.test(value) &&
    !value.includes("..");
  const candidates = [
    ...new Set(
      editions
        .filter((e) => e.ia && (!e.language || e.language.includes(code)))
        .flatMap((e) => (Array.isArray(e.ia) ? e.ia : [e.ia]))
        .filter(valid),
    ),
  ];
  const examined = new Set();
  async function tryEditions(ids) {
    for (const candidate of ids) {
      if (examined.size >= 4 || examined.has(candidate)) continue;
      examined.add(candidate);
      try {
        const content = await resolveArchive(candidate, readText);
        if (content.type !== "source") return content;
      } catch (error) {
        if (error.message !== "Source returned 404") throw error;
      }
    }
    return null;
  }
  const primary = await tryEditions(candidates);
  if (primary) return primary;
  // Search commonly returns just one edition. Inspect the work's edition list
  // for other files in the requested language before reporting unavailable.
  if (examined.size < 4) {
    try {
      const list = await (
        await fetchUpstream(
          `https://openlibrary.org/works/${id}/editions.json?limit=50`,
        )
      ).json();
      const alternatives = [
        ...new Set(
          (list.entries || [])
            .filter((e) =>
              e.languages?.some((l) => l.key === `/languages/${code}`),
            )
            .map((e) => e.ocaid)
            .filter(valid),
        ),
      ];
      const alternate = await tryEditions(alternatives);
      if (alternate) return alternate;
    } catch (error) {
      if (error.message !== "Source returned 404") throw error;
    }
  }
  return {
    type: "source",
    url: `https://openlibrary.org/works/${id}`,
    available: false,
    message:
      "This catalogue record does not provide a readable digital edition in the selected language. Import your EPUB, PDF, or text copy to read and highlight it here.",
    attribution:
      "Open Library · Edition availability is managed by the source library.",
  };
}
