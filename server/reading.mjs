import { fetchUpstream } from "./catalog.mjs";

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
export async function archiveResponse(url) {
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
    const response = await fetch(current, {
      redirect: "manual",
      credentials: "omit",
      signal: AbortSignal.timeout(15000),
      headers: {
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
  if (hasOpenLicense(data.metadata) && files.length) {
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
        (f) => f.format === format && Number(f.size) <= 50 * 1024 * 1024,
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
  const available = files.some((f) =>
    [
      "DjVuTXT",
      "Text PDF",
      "Image Container PDF",
      "EPUB",
      "Single Page Processed JP2 ZIP",
    ].includes(f.format),
  );
  return {
    type: "source",
    url,
    embedUrl: `https://archive.org/embed/${encodeURIComponent(id)}`,
    available,
    message: available
      ? "Read this edition with the source library’s page viewer. Use My Quotes to keep notes or quoted passages."
      : "The source controls access to this edition. It may offer a preview or require an eligible account or loan. You can also import your own copy.",
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
  const edition = editions.find(
    (e) => e.ia && (!e.language || e.language.includes(code)),
  );
  const candidates = edition
    ? Array.isArray(edition.ia)
      ? edition.ia
      : [edition.ia]
    : [];
  const candidate = candidates.find(
    (value) =>
      typeof value === "string" &&
      archiveIdentifier.test(value) &&
      !value.includes(".."),
  );
  if (candidate) return resolveArchive(candidate, readText);
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
