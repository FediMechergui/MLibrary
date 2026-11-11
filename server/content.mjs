import { fetchUpstream } from "./catalog.mjs";
import { parseHTML } from "linkedom";
import { standardBook, standardPath } from "./standardebooks.mjs";
import { openAccessContent } from "./openaccess.mjs";
import { hindawiEdition } from "./hindawi.mjs";
import { gallicaBook } from "./gallica.mjs";
import { openitiContent, openitiId } from "./openiti.mjs";
import {
  archiveIdentifier,
  resolveArchive,
  resolveOpenLibrary,
} from "./reading.mjs";
const LIMIT = 4 * 1024 * 1024;
export async function readLimited(response, maxBytes = LIMIT) {
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel();
    throw new Error(
      "This book is too large for the text reader. Use the source edition.",
    );
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error("This book exceeds the reader download limit.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
export function parseBookId(id) {
  if (id.startsWith('openiti:') && openitiId.test(id.slice(8))) return { source: 'openiti', id: id.slice(8) };
  const collection = /^(hindawi:\d{8}|gallica:bpt6k\d+[a-z0-9])$/.exec(id);
  if (collection) return { source: id.split(":")[0], id: id.split(":")[1] };
  const openAccess = /^(oapen|doab):(\d{1,10})$/.exec(id);
  if (openAccess) return { source: openAccess[1], id: openAccess[2] };
  if (id.startsWith("standardebooks:"))
    return { source: "standardebooks", id: standardPath(id.slice(15)) };
  if (/^gutenberg:[1-9]\d{0,6}$/.test(id))
    return { source: "gutenberg", id: id.split(":")[1] };
  const wiki = /^wikisource:(en|fr|ar):([1-9]\d{0,9})$/.exec(id);
  if (wiki) return { source: "wikisource", language: wiki[1], id: wiki[2] };
  if (/^openlibrary:OL[1-9]\d{0,12}W$/.test(id))
    return { source: "openlibrary", id: id.split(":")[1] };
  if (
    id.startsWith("archive:") &&
    archiveIdentifier.test(id.slice(8)) &&
    !id.includes("..")
  )
    return { source: "archive", id: id.slice(8) };
  throw new Error("Unsupported book identifier");
}
export async function getContent(
  bookId,
  { language = "en", chapter, format = "auto" } = {},
) {
  if (!["auto", "text", "epub", "pdf"].includes(format))
    throw new Error("Invalid reader format");
  const book = parseBookId(bookId);
  if (book.source === 'openiti') return openitiContent(book.id, chapter);
  if (book.source === "hindawi") return (await hindawiEdition(book.id)).content;
  if (book.source === "gallica") return (await gallicaBook(book.id)).content;
  if (["oapen", "doab"].includes(book.source))
    return openAccessContent(book.source, book.id, format);
  if (book.source === "standardebooks")
    return (await standardBook(book.id)).content;
  if (book.source === "archive")
    return resolveArchive(book.id, readLimited, format);
  if (book.source === "openlibrary")
    return resolveOpenLibrary(book.id, language, readLimited, format);
  if (book.source === "gutenberg") {
    const metadata = await (
      await fetchUpstream(`https://www.gutenberg.org/ebooks/${book.id}.rdf`, {
        headers: { Accept: "application/rdf+xml" },
      })
    ).text();
    if (
      !/<dcterms:rights>Public domain in the USA\.<\/dcterms:rights>/.test(
        metadata,
      )
    )
      throw new Error(
        "Read this edition at Project Gutenberg to check its permissions and available formats.",
      );
    const response = await fetchUpstream(
      `https://www.gutenberg.org/cache/epub/${book.id}/pg${book.id}.txt`,
      { headers: { Accept: "text/plain" } },
    );
    return {
      type: "text",
      text: await readLimited(response),
      chapters: [],
      sourceUrl: `https://www.gutenberg.org/ebooks/${book.id}`,
      attribution:
        "Project Gutenberg · Public domain in the USA. The original license is preserved in the text.",
    };
  }
  const u = new URL(`https://${book.language}.wikisource.org/w/api.php`);
  if (
    chapter &&
    (typeof chapter !== "string" ||
      chapter.length > 350 ||
      /[\x00-\x1f]/.test(chapter))
  )
    throw new Error("Invalid chapter title");
  u.search = new URLSearchParams({
    action: "parse",
    pageid: book.id,
    prop: "text|links|displaytitle",
    format: "json",
    disableeditsection: "1",
    maxlag: "5",
  }).toString();
  const root = await (await fetchUpstream(u)).json();
  let data = root;
  if (chapter && chapter !== root.parse?.title) {
    if (!chapter.startsWith(`${root.parse?.title}/`))
      throw new Error("This chapter does not belong to the selected work");
    u.searchParams.delete("pageid");
    u.searchParams.set("page", chapter);
    data = await (await fetchUpstream(u)).json();
  }
  if (!data.parse?.text)
    throw new Error("This Wikisource page could not be loaded.");
  const { document } = parseHTML(
    `<html><body>${data.parse.text["*"]}</body></html>`,
  );
  document
    .querySelectorAll(
      "script,style,nav,.mw-editsection,.noprint,.ws-noexport,.header-container,.wst-header,.licenseContainer,.catlinks",
    )
    .forEach((el) => el.remove());
  document.querySelectorAll("br").forEach((el) => el.replaceWith("\n"));
  document
    .querySelectorAll("p,div,h1,h2,h3,li,tr,blockquote")
    .forEach((el) => el.append("\n\n"));
  const text = document.body.textContent
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n/g, "\n\n")
    .trim();
  const title = root.parse.title;
  const chapters = (root.parse.links || [])
    .filter(
      (l) =>
        l.ns === 0 && l["*"].startsWith(`${title}/`) && l.exists !== undefined,
    )
    .map((l) => ({
      title: l["*"],
      id: l["*"],
      url: `https://${book.language}.wikisource.org/wiki/${encodeURIComponent(l["*"])}`,
    }));
  if (chapter && chapter !== title)
    chapters.unshift({
      title,
      id: title,
      url: `https://${book.language}.wikisource.org/wiki/${encodeURIComponent(title)}`,
    });
  return {
    type: "text",
    text,
    chapter: data.parse.title,
    chapters,
    sourceUrl: `https://${book.language}.wikisource.org/?curid=${book.id}`,
    attribution:
      "Wikisource contributors. This is the selected page, which may be a chapter or contents page. Consult the original for the complete work, licenses, and edit history.",
  };
}
