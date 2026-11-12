import { DOMParser, parseHTML } from "linkedom";

export const communitySources = ["unglue", "fadedpage", "globalgrey"];
export const origins = {
  unglue: "https://unglue.it",
  fadedpage: "https://www.fadedpage.com",
  globalgrey: "https://www.globalgreyebooks.com",
};
export const rights = {
  unglue:
    "See this edition's Creative Commons or public-domain license at Unglue.it.",
  fadedpage:
    "Faded Page / Distributed Proofreaders Canada. Public domain in Canada; status elsewhere may differ. Original credits retained.",
  globalgrey:
    "Global Grey edition for personal reading. Original branding and credits retained. https://www.globalgreyebooks.com/terms-conditions.html",
};
export function clean(value = "") {
  return parseHTML(`<html><body>${value}</body></html>`)
    .document.body.textContent.replace(/\s+/g, " ")
    .trim();
}
export function communityId(source, id) {
  if (
    !communitySources.includes(source) ||
    typeof id !== "string" ||
    !(
      source === "globalgrey"
        ? /^[a-z0-9][a-z0-9-]{0,220}$/
        : source === "fadedpage"
          ? /^\d{6}[A-Z0-9]{2}$/
          : /^\d{1,10}$/
    ).test(id)
  )
    throw new Error("Invalid community edition");
  return id;
}
export function pageUrl(source, id) {
  communityId(source, id);
  return source === "unglue"
    ? `${origins.unglue}/work/${id}/`
    : source === "fadedpage"
      ? `${origins.fadedpage}/showbook.php?pid=${id}`
      : `${origins.globalgrey}/book-page/${id}-ebook.html`;
}
export function communityLink(value) {
  const u = new URL(value);
  if (u.protocol !== "https:" || u.username || u.password || u.port)
    throw new Error("Invalid community book link");
  const source = Object.keys(origins).find(
    (s) => new URL(origins[s]).hostname === u.hostname,
  );
  const id =
    source === "unglue"
      ? /^\/work\/(\d+)\/?$/.exec(u.pathname)?.[1]
      : source === "fadedpage" && u.pathname === "/showbook.php"
        ? u.searchParams.get("pid")
        : source === "globalgrey"
          ? /^\/(?:book-page\/)?([a-z0-9-]+)-ebook\.html$/.exec(u.pathname)?.[1]
          : null;
  if (!id) throw new Error("Invalid community book link");
  return { source, id: communityId(source, id) };
}
export function baseBook(source, id, title, authors, language) {
  return {
    id: `${source}:${communityId(source, id)}`,
    title: clean(title),
    authors: authors.map(clean).filter(Boolean),
    source,
    sourceUrl: pageUrl(source, id),
    language,
    languages: language ? [language] : [],
    cover: null,
    subjects: [],
    description: "",
    access: "read",
    rights: rights[source],
    formats: ["EPUB"],
  };
}
export function parseUnglue(xml, { requireFiles = true } = {}) {
  const d = new DOMParser().parseFromString(xml, "text/xml");
  if (!d.getElementsByTagName("feed").length)
    throw new Error("Invalid Unglue.it catalogue feed");
  const records = [...d.getElementsByTagName("entry")].flatMap((e) => {
    const text = (tag) =>
      e.getElementsByTagName(tag)[0]?.textContent.trim() || "";
    const id = /\/work\/(\d+)\//.exec(text("id"))?.[1];
    const language = text("dcterms:language").toLowerCase().split("-")[0];
    if (!id || !["en", "fr", "ar"].includes(language)) return [];
    const links = [...e.getElementsByTagName("link")];
    const files = links
      .filter(
        (l) =>
          /\/acquisition\/open-access$/.test(l.getAttribute("rel") || "") &&
          ["application/epub+zip", "application/pdf"].includes(
            l.getAttribute("type"),
          ),
      )
      .map((l) => ({
        url: l.getAttribute("href").replace(/&amp;/g, "&"),
        format: l.getAttribute("type") === "application/pdf" ? "pdf" : "epub",
        rights: l.getAttribute("dcterms:rights") || rights.unglue,
      }));
    if (!files.length && requireFiles) return [];
    const b = baseBook(
      "unglue",
      id,
      text("title"),
      [...e.getElementsByTagName("author")].map(
        (a) => a.getElementsByTagName("name")[0]?.textContent || "",
      ),
      language,
    );
    b.cover =
      links
        .find((l) => /\/image$/.test(l.getAttribute("rel") || ""))
        ?.getAttribute("href") || null;
    b.description = clean(text("content")).slice(0, 700);
    b.rights =
      files[0]?.rights ||
      links
        .find((l) => l.hasAttribute("dcterms:rights"))
        ?.getAttribute("dcterms:rights") ||
      rights.unglue;
    b.formats = [...new Set(files.map((f) => f.format.toUpperCase()))];
    return [{ ...b, files }];
  });
  const next = [...d.documentElement.children]
    .find((e) => e.tagName === "link" && e.getAttribute("rel") === "next")
    ?.getAttribute("href")
    ?.replace(/&amp;/g, "&");
  return { records, next };
}
export function parseFadedList(html) {
  const { document: d } = parseHTML(html);
  const records = [...d.querySelectorAll("tr")].flatMap((row) => {
    const link = row.querySelector('a[href*="showbook.php?pid="]');
    if (!link) return [];
    const id = /pid=(\d{6}[A-Z0-9]{2})/.exec(link.getAttribute("href"))?.[1];
    if (!id) return [];
    const authors = [...row.querySelectorAll('a[href*="author="]')].map(
      (a) => a.textContent,
    );
    const b = baseBook("fadedpage", id, link.textContent, authors, "");
    b.year = Number(row.lastElementChild?.textContent) || undefined;
    return [b];
  });
  return {
    records,
    pages: [
      ...new Set(
        [...d.querySelectorAll('a[href*="allbooks.php?range="]')].map(
          (a) => new URL(a.getAttribute("href"), origins.fadedpage).href,
        ),
      ),
    ],
  };
}
export function parseGreyList(html) {
  const { document: d } = parseHTML(html);
  const records = [...d.querySelectorAll("article.book-card")].flatMap(
    (card) => {
      const link = card.querySelector(".book-title a[href]");
      if (!link) return [];
      let ref;
      try {
        ref = communityLink(link.getAttribute("href"));
      } catch {
        return [];
      }
      const b = baseBook(
        "globalgrey",
        ref.id,
        link.textContent,
        [card.querySelector(".book-author")?.textContent || ""],
        "en",
      );
      b.sourceUrl = link.getAttribute("href");
      b.cover = card.querySelector("img")?.getAttribute("src") || null;
      return [b];
    },
  );
  const pages = [...d.querySelectorAll(".pager a")];
  const current = Number(
    pages
      .find((a) => a.getAttribute("aria-current") === "page")
      ?.textContent.trim() || 1,
  );
  const next =
    pages.find((a) => /^Next\b/i.test(a.textContent.trim())) ||
    pages.find((a) => Number(a.textContent.trim()) === current + 1);
  return { records, next: next?.getAttribute("href") };
}
