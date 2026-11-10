// Evidence: docs/SOURCE-AUDIT-1.0.md and scripts/audit-sources.mjs.
// These are dated observations, not a claim of continuous availability.
const findings = {
  gutenberg: [
    "working",
    "English and French searches and full texts passed. An intermittent English text timeout passed on recheck. The Arabic query returned no matches; Arabic coverage is very limited.",
    "Use Wikisource for Arabic. Text editions preserve the original Gutenberg license; two starter books also work without a source connection.",
  ],
  wikisource: [
    "working",
    "English, French and Arabic search and text passed. Results can be poems, contents pages or chapters, rather than complete books.",
    "Open Contents in the reader to follow the work's chapters. Select a language before searching; import a complete EPUB when you need the entire work offline.",
  ],
  openlibrary: [
    "limited",
    "Search passed in all three languages. The French Madame Bovary record now opens after checking older linked editions. The sampled English and Arabic first results still have no public download.",
    "The reader checks public editions in the requested language. Choose another format, search your fallback library, or import a copy you already have.",
  ],
  archive: [
    "limited",
    "All three language searches passed. English and French text and actual PDF bytes passed. The previously failing Arabic edition now resolves to EPUB. Restricted editions correctly stay unavailable.",
    "Automatic tries text, then EPUB/PDF when text fails. Choose PDF for scans or EPUB for reflowable text. Downloads retry interrupted chunks and save only complete files.",
  ],
  hindawi: [
    "blocked",
    "Hindawi redirects to Safahat. The book collection returned HTTP 403 with a browser verification challenge from this environment.",
    "Use Arabic Wikisource as a fallback. If you obtain an EPUB/PDF from the publisher through its normal access process, import it here. An automated adapter is not connected.",
  ],
  gallica: [
    "blocked",
    "The collection, document metadata and IIIF sample returned HTTP 403 access challenges from this environment.",
    "Use French Wikisource for transcriptions or Archive for other scans. Import a downloaded PDF; image-only pages need OCR for passage selection. Gallica search is not connected.",
  ],
  standardebooks: [
    "limited",
    "The catalogue opens, but anonymous OPDS returns HTTP 401. The EPUB URL first returns HTML; the publisher's download action was verified to return actual EPUB bytes.",
    "Paste an individual Standard Ebooks book page below. MLibrary follows its public download action, saves the EPUB and opens it automatically. The authenticated OPDS feed remains separate; use Gutenberg as your searchable fallback.",
  ],
  doab: [
    "directory",
    "The directory and OAI metadata service responded. DOAB points to publishers; metadata harvesting does not itself return a readable book.",
    "Follow the publisher's licensed edition, then import its EPUB/PDF. Choose a fallback library for in-app search. There is no DOAB book-download adapter in this release.",
  ],
  oapen: [
    "limited",
    "The repository home page responded, but its documented REST search endpoint returned HTTP 403 from this environment.",
    "Obtain the licensed PDF through the repository's normal download flow and import it. The REST adapter needs working service access before it can be connected.",
  ],
  qdl: [
    "blocked",
    "The Arabic/English collection and English search returned HTTP 403 browser verification challenges from this environment.",
    "Use Arabic Wikisource or Archive as a fallback. Import an offered PDF; some records are archive objects, not books. The image API is not connected.",
  ],
};
export function sourceAudit(id) {
  const [status, finding, solution] = findings[id];
  return { status, finding, solution, checkedAt: "2026-11-10T08:48:20.420Z" };
}
