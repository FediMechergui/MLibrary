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
    "limited",
    "The public metadata export added 38,614 English, French and Arabic book records. A linked Ledizioni PDF returned verified bytes. Other publishers may require separate adapters; catalogue inclusion does not guarantee a downloadable file.",
    "Search DOAB here or paste a book link. Public OAPEN and supported Ledizioni editions download into the reader with their license. Unsupported publisher links offer another edition or local import. Metadata refresh runs daily.",
  ],
  oapen: [
    "limited",
    "The REST API denies access, but the supported OAI metadata and public book files work. The tested book returned complete text. The repository also enforces request limits; rate-limited requests stop and show an explanation.",
    "Search the OAPEN editions indexed through DOAB, or paste a repository book link. Automatic prefers text; choose PDF for original pages. Whole-file downloads without range support are limited to 32 MB and cached briefly. Request pacing and caching reduce repeated downloads.",
  ],
  qdl: [
    "blocked",
    "The Arabic/English collection and English search returned HTTP 403 browser verification challenges from this environment.",
    "Use Arabic Wikisource or Archive as a fallback. Import an offered PDF; some records are archive objects, not books. The image API is not connected.",
  ],
};
export function sourceAudit(id) {
  const [status, finding, solution] = findings[id];
  return {
    status,
    finding,
    solution,
    checkedAt: ["doab", "oapen"].includes(id)
      ? "2026-11-10T10:22:43.462Z"
      : "2026-11-10T08:48:20.420Z",
  };
}
