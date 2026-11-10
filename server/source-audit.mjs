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
    "limited",
    "The website and tested EPUB are challenged, but the publisher's advertised PDF server returned a complete 366-page Arabic book with its title and author. Search is not connected.",
    "Paste a Safahat or Hindawi book link below. Available public PDFs up to 32 MB download into the reader and remain offline. Copyright notices stay in the file. Unavailable PDFs stop with an explanation; EPUB challenges are not bypassed.",
  ],
  gallica: [
    "limited",
    "Live Gallica metadata, text and IIIF services are challenged. BnF's official bulk-download service works; a validated French BnF–OBVIL text subset is imported and searchable here. Malformed XML files were excluded.",
    "Search this library or paste a link to an imported edition. Its OCR text opens and saves offline, with BnF–OBVIL attribution. This is a limited text collection, not all Gallica scans; original OCR errors may remain. Gallica reuse conditions apply.",
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
    "The collection, search, documented IIIF image/manifest and advertised PDF download all returned HTTP 403 verification pages. A British Library OCR training dataset contains sample pages, not complete QDL books.",
    "On Android, use Browse & import PDF: complete any verification in the on-device browser, then choose QDL's PDF download. A successful download imports into the offline reader. If the embedded browser is refused, use Chrome, download, then Open with / Share to MLibrary. This user-assisted route does not unlock automated catalogue access; live QDL verification remains provider-dependent.",
  ],
};
export function sourceAudit(id) {
  const [status, finding, solution] = findings[id];
  return {
    status,
    finding,
    solution,
    checkedAt: ["hindawi", "gallica", "qdl"].includes(id)
      ? "2026-11-10T12:00:00.000Z"
      : ["doab", "oapen"].includes(id)
        ? "2026-11-10T10:22:43.462Z"
        : "2026-11-10T08:48:20.420Z",
  };
}
