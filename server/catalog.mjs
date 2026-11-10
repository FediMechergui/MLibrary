import { searchGutenberg } from "./gutenberg.mjs";
import { diagnose, sourceFromUrl, sourcePolicy } from "./source-policy.mjs";
export const LANGUAGES = ["en", "fr", "ar"];
export const SOURCES = ["gutenberg", "wikisource", "openlibrary", "archive"];
const codes = { en: "eng", fr: "fre", ar: "ara" };
export const sourceDirectory = [
  {
    id: "gutenberg",
    name: "Project Gutenberg",
    languages: ["en", "fr", "ar"],
    url: "https://www.gutenberg.org",
    kind: "integrated",
    description: "Public-domain classics, with full text and EPUB editions.",
    rights: "Public domain in the USA; other jurisdictions may differ.",
  },
  {
    id: "wikisource",
    name: "Wikisource",
    languages: ["en", "fr", "ar"],
    url: "https://wikisource.org",
    kind: "integrated",
    description:
      "Community-transcribed texts, editions, and chapters in three languages.",
    rights: "See the source page for work-specific rights and attribution.",
  },
  {
    id: "openlibrary",
    name: "Open Library",
    languages: ["en", "fr", "ar"],
    url: "https://openlibrary.org",
    kind: "discovery",
    description:
      "A broad bibliographic catalogue. Availability and borrowing vary by edition.",
    rights:
      "Metadata discovery does not imply permission to redistribute a book.",
  },
  {
    id: "archive",
    name: "Internet Archive",
    languages: ["en", "fr", "ar"],
    url: "https://archive.org/details/texts",
    kind: "discovery",
    description:
      "Scanned books and digitized collections. Publicly downloadable editions open in MLibrary's own reader.",
    rights:
      "Availability, borrowing, and item rights are checked at the source.",
  },
  {
    id: "hindawi",
    name: "Hindawi / Safahat",
    languages: ["ar"],
    url: "https://www.safahat.org/books/",
    kind: "directory",
    description:
      "Arabic literature, translations, and nonfiction from the Hindawi Foundation.",
    rights:
      "Link to publisher editions; permission is required before bulk redistribution.",
  },
  {
    id: "gallica",
    name: "Gallica · BnF",
    languages: ["fr", "ar", "en"],
    url: "https://gallica.bnf.fr",
    kind: "directory",
    description:
      "French national-library scans, manuscripts, and historic editions.",
    rights: "Consult the item rights and Gallica reuse conditions.",
  },
  {
    id: "standardebooks",
    name: "Standard Ebooks",
    languages: ["en"],
    url: "https://standardebooks.org/ebooks",
    kind: "directory",
    description: "Carefully typeset public-domain EPUB editions.",
    rights: "Public-domain status is based on US law; see each edition.",
  },
  {
    id: "doab",
    name: "Directory of Open Access Books",
    languages: ["en", "fr", "ar"],
    url: "https://www.doabooks.org",
    kind: "directory",
    description: "Peer-reviewed academic books from open-access publishers.",
    rights: "License and permitted uses vary by book.",
  },
  {
    id: "oapen",
    name: "OAPEN Library",
    languages: ["en", "fr", "ar"],
    url: "https://library.oapen.org",
    kind: "directory",
    description: "Open-access scholarly books and research monographs.",
    rights: "Respect each publication’s Creative Commons or publisher license.",
  },
  {
    id: "qdl",
    name: "Qatar Digital Library",
    languages: ["ar", "en"],
    url: "https://www.qdl.qa",
    kind: "directory",
    description:
      "Arabic and English access to historical archives and manuscripts.",
    rights: "Read the rights statement attached to each digital object.",
  },
];

export async function fetchUpstream(url, options = {}) {
  const response = await fetchWithRetry(url, {
    ...options,
    headers: {
      "User-Agent": `MLibrary/1.0 (${process.env.CATALOG_CONTACT || "https://github.com/FediMechergui/MLibrary"})`,
      Accept: "application/json",
      ...options.headers,
    },
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw Object.assign(new Error(`Source returned ${response.status}`), {
      status: response.status,
    });
  }
  return response;
}
export async function fetchWithRetry(
  url,
  { timeoutMs, retries, ...options } = {},
) {
  const policy = sourcePolicy(sourceFromUrl(url));
  timeoutMs ??= policy.timeoutMs;
  retries ??= policy.retries;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, {
        ...options,
        signal: options.signal ?? AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (
        attempt >= retries ||
        options.signal?.aborted ||
        !(error instanceof TypeError || error.name === "TimeoutError")
      )
        throw error;
    }
  }
}
async function json(url) {
  return (await fetchUpstream(url)).json();
}
export function normalizeGutenberg(b) {
  const formats = b.formats || {};
  return {
    id: `gutenberg:${b.id}`,
    title: b.title,
    authors: (b.authors || []).map((a) => a.name),
    language: b.languages?.find((l) => LANGUAGES.includes(l)) || "en",
    languages: b.languages || [],
    source: "gutenberg",
    sourceUrl: `https://www.gutenberg.org/ebooks/${b.id}`,
    cover: formats["image/jpeg"] || null,
    subjects: (b.subjects || []).slice(0, 8),
    description: b.summaries?.[0] || (b.subjects || []).join(" · "),
    access: b.copyright === false ? "read" : "source",
    rights:
      b.copyright === false
        ? "Public domain in the USA"
        : "Check rights at source",
    formats: Object.keys(formats).some((f) => f.startsWith("text/plain"))
      ? ["TXT", ...(formats["application/epub+zip"] ? ["EPUB"] : [])]
      : [],
    downloads: b.download_count || 0,
  };
}
export function validateSearch(params) {
  const q = (params.get("q") || "").trim().slice(0, 160);
  const language = params.get("language") || "all";
  const source = params.get("source") || "all";
  const page = Number(params.get("page") || 1);
  const excluded = (params.get("exclude") || "").split(",").filter(Boolean);
  if (
    ![...LANGUAGES, "all"].includes(language) ||
    ![...SOURCES, "all"].includes(source) ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > 100 ||
    excluded.some((s) => !SOURCES.includes(s))
  )
    throw new Error("Invalid search filters");
  return {
    q,
    language,
    source,
    page,
    ...(excluded.length ? { excluded: [...new Set(excluded)].sort() } : {}),
  };
}
export function normalizeTitle(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f\u064B-\u065F]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}
export function deduplicate(books) {
  const seen = new Set();
  return books.filter((b) => {
    const key = `${b.source}:${b.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
async function gutenberg({ q, language, page }) {
  return searchGutenberg({ q, language, page });
}
async function wikiOne({ q, page }, language) {
  const u = new URL(`https://${language}.wikisource.org/w/api.php`);
  u.search = new URLSearchParams({
    action: "query",
    format: "json",
    list: "search",
    srnamespace: "0",
    srsearch: q || { en: "novel", fr: "roman", ar: "كتاب" }[language],
    srlimit: "12",
    sroffset: String((page - 1) * 12),
    srprop: "snippet|wordcount",
    maxlag: "5",
  }).toString();
  const data = await json(u);
  if (data.error) throw new Error("Wikisource temporarily unavailable");
  return {
    source: "wikisource",
    language,
    count: data.query.searchinfo.totalhits,
    hasMore: !!data.continue,
    books: data.query.search.map((b) => ({
      id: `wikisource:${language}:${b.pageid}`,
      title: b.title,
      authors: ["Wikisource"],
      language,
      languages: [language],
      source: "wikisource",
      sourceUrl: `https://${language}.wikisource.org/?curid=${b.pageid}`,
      cover: null,
      subjects: [],
      description: b.snippet
        .replace(/<[^>]*>/g, "")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&"),
      access: "read",
      rights: "Rights and attribution on the Wikisource page",
      formats: ["TXT"],
      wordCount: b.wordcount,
    })),
  };
}
async function openlibrary({ q, language, page }) {
  const u = new URL("https://openlibrary.org/search.json");
  u.search = new URLSearchParams({
    q: q || "subject:fiction",
    ...(language !== "all"
      ? { language: codes[language] }
      : {
          q: `${q || "subject:fiction"} (language:eng OR language:fre OR language:ara)`,
        }),
    page: String(page),
    limit: "24",
    fields:
      "key,title,author_name,cover_i,language,first_publish_year,ebook_access,subject",
  }).toString();
  const data = await json(u);
  return {
    source: "openlibrary",
    count: data.numFound,
    hasMore: page * 24 < data.numFound,
    books: data.docs.map((b) => ({
      id: `openlibrary:${b.key.split("/").pop()}`,
      title: b.title,
      authors: b.author_name || [],
      language:
        language === "all"
          ? LANGUAGES.find((l) => b.language?.includes(codes[l])) || "en"
          : language,
      languages: LANGUAGES.filter((l) => b.language?.includes(codes[l])),
      source: "openlibrary",
      sourceUrl: `https://openlibrary.org${b.key}`,
      cover: b.cover_i
        ? `https://covers.openlibrary.org/b/id/${b.cover_i}-M.jpg`
        : null,
      subjects: (b.subject || []).slice(0, 8),
      description: (b.subject || []).slice(0, 6).join(" · "),
      access: b.ebook_access === "borrowable" ? "borrow" : "source",
      rights: "Availability depends on the edition",
      formats: [],
      year: b.first_publish_year,
    })),
  };
}
export function archiveQuery(q, language) {
  const escaped = q.replace(/[+\-!(){}\[\]^"~*?:\\/&|]/g, " ").trim();
  const lang =
    language === "all"
      ? "(language:eng OR language:fre OR language:ara OR language:English OR language:French OR language:Arabic)"
      : `(${[codes[language], { en: "English", fr: "French", ar: "Arabic" }[language]].map((l) => `language:${l}`).join(" OR ")})`;
  return `mediatype:texts AND ${lang}${
    escaped
      ? ` AND (${escaped
          .split(/\s+/)
          .map((w) => `"${w}"`)
          .join(" AND ")})`
      : ""
  }`;
}
async function archive({ q, language, page }) {
  const u = new URL("https://archive.org/advancedsearch.php");
  u.search = new URLSearchParams({
    q: archiveQuery(q, language),
    output: "json",
    rows: "24",
    page: String(page),
    "fl[]":
      "identifier,title,creator,language,description,year,rights,licenseurl",
    "sort[]": q ? "downloads desc" : "publicdate desc",
  }).toString();
  const data = await json(u);
  return {
    source: "archive",
    count: data.response.numFound,
    hasMore: page * 24 < data.response.numFound,
    books: data.response.docs.map((b) => ({
      id: `archive:${b.identifier}`,
      title: String(b.title || b.identifier),
      authors: Array.isArray(b.creator)
        ? b.creator
        : b.creator
          ? [b.creator]
          : [],
      language:
        language === "all"
          ? LANGUAGES.find(
              (l) =>
                String(b.language).toLowerCase().includes(codes[l]) ||
                String(b.language)
                  .toLowerCase()
                  .includes({ en: "english", fr: "french", ar: "arabic" }[l]),
            ) || "en"
          : language,
      languages: [],
      source: "archive",
      sourceUrl: `https://archive.org/details/${encodeURIComponent(b.identifier)}`,
      cover: `https://archive.org/services/img/${encodeURIComponent(b.identifier)}`,
      subjects: [],
      description: String(b.description || "")
        .replace(/<[^>]*>/g, "")
        .slice(0, 1500),
      access: "source",
      rights: String(
        b.rights ||
          b.licenseurl ||
          "Check rights and availability at Internet Archive",
      ).slice(0, 500),
      formats: ["SCAN"],
      year: b.year,
    })),
  };
}
export async function searchCatalog(options) {
  const selected = (
    options.source === "all"
      ? options.q
        ? SOURCES
        : ["gutenberg", "wikisource"]
      : [options.source]
  ).filter((s) => !options.excluded?.includes(s));
  const tasks = selected.flatMap((source) =>
    source === "wikisource"
      ? (options.language === "all" ? LANGUAGES : [options.language]).map(
          (lang) => ({ source, run: () => wikiOne(options, lang) }),
        )
      : [
          {
            source,
            run: () => ({ gutenberg, openlibrary, archive })[source](options),
          },
        ],
  );
  const results = await Promise.allSettled(tasks.map((t) => t.run()));
  const sources = [],
    books = [],
    errors = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      const { books: items, ...meta } = r.value;
      sources.push(meta);
      books.push(...items);
    } else
      errors.push({
        source: tasks[i].source,
        ...diagnose(r.reason),
      });
  });
  // Keep source editions distinct: similar titles are not proof of the same work.
  return {
    books: deduplicate(books),
    sources,
    errors,
    hasMore: sources.some((s) => s.hasMore),
    page: options.page,
    updatedAt: new Date().toISOString(),
  };
}
