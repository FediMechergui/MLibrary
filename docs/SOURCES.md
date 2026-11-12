# Source research and integration status

**Version 1.6.0 — candidate integrations:** [Unglue.it, Faded Page, Global Grey, Anna’s Archive and Open SLUM](CANDIDATES-1.6.md) are connected. The first three add 11,157 indexed editions with automatic reader download/import; Anna’s uses an on-device browser-assisted route, and Open SLUM supplies status information. Coverage and remaining provider limitations are documented separately from the [original scouting](FMHY-SCOUT.md).

The [Rust client follow-up](FMHY-SCOUT.md#follow-up-the-user-supplied-rust-client) identifies an additional Anna's Archive route: a personal browser-verified session for live searches. The published 0.3.0 source was inspected and checksum-verified; anonymous endpoint checks still returned a challenge. Interactive and authenticated access remain unverified.

**Version 1.5.0:** OpenITI adds 7,098 primary Arabic editions from its official CC BY-NC-SA corpus, with pinned source files, attribution and multi-section offline reading. Gallica now includes 710 complete French OCR texts from the official BnF–OBVIL i/u/x/y/z archives. See the [current eleven-source audit](SOURCE-AUDIT-1.5.md) for working routes, representative failures and recovery options; historical research below records earlier observations.

**Version 1.1.0:** [DOAB/OAPEN public metadata, search and reader integration](OPENACCESS-1.1.md) supersedes their older directory-only status below. This update does not bypass access controls on other providers.

**Version 1.0.0:** See the [complete ten-source audit, verified failures, fixes and per-source recovery options](SOURCE-AUDIT-1.0.md), checked 10 November 2026. Standard Ebooks now supports individual-book link import into the reader; its full catalogue feed is not integrated. The historical tables below describe the initial adapters.

Reviewed 9 November 2026. The objective is a very large multilingual discovery catalogue with explicitly identified reading availability. A digitized or searchable record is not automatically a freely redistributable book. Counts from different providers must not be added and advertised as unique books.

## Connected sources

| Source                                                                      | Languages                                   | Current implementation                                                                       | Expansion route                                                                                                                       |
| --------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [Project Gutenberg](https://www.gutenberg.org/ebooks/offline_catalogs.html) | Mostly English; French; very limited Arabic | Official CSV imported into a compressed search snapshot. Rights-checked plain text reader.   | Use official RDF/CSV feeds and mirrors. RDF includes rights absent from CSV. Source licenses stay attached to content.                |
| [Wikisource](https://wikisource.org/)                                       | Arabic, French, English                     | MediaWiki search and selected-page text reading; links to subpages and original attribution. | MediaWiki dumps for offline indexing; build work/chapter relationships before treating pages as complete books.                       |
| [Open Library](https://openlibrary.org/developers/api)                      | Multilingual metadata                       | Live discovery queries and links to original records, including borrowing where indicated.   | [Monthly dumps](https://openlibrary.org/developers/dumps), local work/edition/author index, and identifiers for cross-source matches. |
| [Internet Archive](https://archive.org/developers/metadata.html)            | Multilingual, including scans               | Text-item metadata search, cover thumbnails, and source links.                               | Rights-reviewed item metadata, scan/IIIF support, and source-hosted borrowing. Access status must be checked per item.                |

Open Library documents a default request limit of one request per second and higher limits for properly identified clients. Its APIs are not intended as a high-traffic bulk backend. MLibrary caches queries; it still needs a shared rate limiter before scaling to high concurrency. Gutenberg explicitly recommends machine-readable catalogues rather than website crawling.

The public Gutendex server was tested but timed out from this environment. MLibrary therefore does not depend on it for production discovery or reading.

### Reading integration in version 0.2

The table above records the initial catalogue adapters. Reading now additionally resolves Open Library work IDs to editions in the selected language and checks alternative editions when needed. Internet Archive files offered publicly open directly in MLibrary's text, EPUB, or PDF reader, retaining the source rights statement. Public availability is not labeled as public-domain status. Private, dark, restricted, and encrypted files are excluded. File requests validate the Archive HTTPS host across redirects and enforce size limits. Large PDFs use range requests inside our own PDF viewer. Book opening never falls back to an embedded website; missing reader files produce an explicit unavailable state with import and alternative-edition actions.

Wikisource chapter links now load inside the same reader and retain the work's contents list. Text, EPUB, and selectable PDF passages support saved highlights, notes, tags, and quote cards. Source directory and attribution pages remain optional information views, separate from book reading. Image-only scans need a text/OCR layer for automatic passage selection.

Version 0.2.1 automatically downloads and imports downloadable EPUB/PDF editions before opening their pages. Complete files and original attribution are saved under the catalogue book's existing ID, with no duplicate shelf entry or manual file picker. Archive/Open Library full-text downloads are saved too. Interrupted transfers never publish a partial offline copy; cancellation stops network requests, and failed downloads or storage writes can be retried. EPUB source downloads remain capped at 50 MB; PDF source downloads now support up to 500 MB, depending on device storage. Local file imports remain capped at 50 MB. Saved PDF blobs are read in local ranges, avoiding a single giant reader buffer.

Live resolver checks on 9 November 2026 returned full text for `ost-english-madamebovarystud00flau` (656,924 characters), full text for Open Library `OL5040656W` (36,043 characters), and an unavailable status for restricted `norwegianwood0000mura`. None returns an embedded book website. These checks verify individual editions, not every book by an author.

Primary implementation references: [Archive metadata API](https://archive.org/developers/md-read.html), [Open Library edition search](https://openlibrary.org/dev/docs/api/search), [Archive BookReader](https://github.com/internetarchive/bookreader), and [Capacitor in-app browser](https://capacitorjs.com/docs/apis/inappbrowser).

## Linked collections and next adapters

| Collection                                                            | Role                                                                                                             | Integration considerations                                                                                                                                                                    |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Hindawi / Safahat](https://www.safahat.org/books/)                   | Major Arabic literature, translation, and nonfiction source. Hindawi's old site redirected here during research. | Link to publisher editions now. Confirm a supported feed, bulk access, and redistribution permissions before importing files. Free publisher access does not imply a universal reuse license. |
| [Gallica / Bibliothèque nationale de France](https://gallica.bnf.fr/) | French books, historic scans, manuscripts, and multilingual material.                                            | [BnF API documentation](https://api.bnf.fr/) covers SRU, bibliographic metadata, and IIIF. Retain item-level reuse conditions and attribution.                                                |
| [Standard Ebooks](https://standardebooks.org/ebooks)                  | High-quality English public-domain EPUB editions.                                                                | The OPDS endpoint returned HTTP 401 during research; do not assume anonymous bulk feed access. Public catalogue links are available.                                                          |
| [Directory of Open Access Books](https://www.doabooks.org/)           | Peer-reviewed open-access academic books.                                                                        | Prefer an approved metadata-harvesting route; store each book's license and publisher URL.                                                                                                    |
| [OAPEN](https://library.oapen.org/)                                   | Open-access scholarly monographs.                                                                                | Harvest repository metadata and license statements; connect DOAB records by DOI or ISBN without collapsing distinct editions.                                                                 |
| [Qatar Digital Library](https://www.qdl.qa/)                          | Arabic/English heritage archives and scans.                                                                      | Institution-owned item metadata, object rights, and supported image APIs. Not every object is a book.                                                                                         |
| [Arabic Collections Online](https://dlib.nyu.edu/aco/)                | Important candidate for Arabic public-domain scanned books.                                                      | The site timed out during this run. Verify current endpoints, rights, and service limits before implementing an adapter.                                                                      |
| [Europeana](https://pro.europeana.eu/page/apis)                       | European cultural heritage discovery, including French and Arabic material.                                      | API registration, object-type filtering, and rights statements; many records describe images or archives rather than books.                                                                   |
| [HathiTrust](https://www.hathitrust.org/)                             | Large research-library catalogue and digitized books.                                                            | Public catalogue/rights metadata first; access and download permissions depend on the item and user/institution.                                                                              |
| [Google Books](https://developers.google.com/books/docs/v1/using)     | Broad multilingual metadata and full-view/preview availability.                                                  | An API key and quota management are needed. Keep FULL_VIEW, PARTIAL, and NO_PAGES distinct; use the official viewer where permitted.                                                          |

## AnyBooks reference

The [supplied Softonic listing](https://anybooks.fr.softonic.com/android) describes offline reading, adjustable font size and brightness, white/night/sepia themes, and reading rewards. Those reading patterns informed MLibrary's settings, offline shelves, and milestones. MLibrary uses its own interface and assets.

The initial implementation used the listing as a feature reference. Its emulator checks were for MLibrary, not AnyBooks.

### Follow-up investigation: 9 November 2026

**Updated result:** the user subsequently supplied the APK, which successfully opened on an Android 9 emulator. Its hash matches Softonic's published file, but the manifest identifies **3.19.0**, not the advertised 3.23.0. Static inspection identifies `api.anybooks.live` as the bundled production catalogue backend, with resource URLs supplied by that service and a Firebase remote-configuration override. Runtime traffic confirms requests to this hostname and DNS failures. After a normal restart, the app also queried `api.anybooks.mobi`, which returned `NXDOMAIN`. The Library loaded its interface without books, search returned a no-results message, and the Bookshelf remained empty. See the [APK inspection and emulator evidence](ANYBOOKS-AUDIT.md) for verified findings and runtime limits. The acquisition failures below describe the earlier search, before the file was supplied.

| Check | Observed result |
| --- | --- |
| [Softonic original reference](https://anybooks.fr.softonic.com/android) and [English download page](https://anybooks.en.softonic.com/android/download) | Indexed listing identifies version 3.23.0. The French download request returned HTTP 412; the English download page failed in a fresh browser session. |
| [Uptodown archive](https://anybooks-read-free-books-novels-and-stories.en.uptodown.com/android/download) | A normal browser loaded the page. Clicking its download button produced no APK within 45 seconds. The page includes a Turnstile verification widget. |
| [APKPure archive](https://apkpure.net/anybooks%F0%9F%93%96free-download-library-novels-stories/com.newanybooks/download) | After its browser redirect, the page stopped at an EdgeOne human-verification screen. No APK downloaded. |
| [APKCombo archive](https://apkcombo.com/anybooks-novels-stories-your-mobile-library/anybooks.book.pdf.epub.txt/) | The download host failed DNS resolution from the local browser. |
| [FileHippo](https://filehippo.com/android/download_anybooks/) | The listing explicitly says a direct download is not provided. |
| [Softplanet](https://www.softplanet.co/anybooks) | The local browser received HTTP 403. |
| [Developer website](https://www.anybooks.app/) | The local fetch failed DNS resolution (`ENOTFOUND`). This alone does not establish whether every historical app backend is offline. |
| Internet Archive CDX query for `anybooks.app/*.apk` | Returned an empty result. This narrow query does not prove that no other archive or subdomain contains an APK. |
| Additional public archive checks after confirming no local APK is available | Internet Archive catalogue searches for AnyBooks returned zero records. A broader Wayback query covering developer subdomains timed out after 25 seconds. GitHub public code search for `anybooks.app` returned no matches. These results do not establish that no copy or API documentation exists elsewhere. |
| Local files and Android tooling | No AnyBooks APK found in the project or matching downloads. Android SDK and emulator images are installed; no connected device had an existing app available to inspect. |

Version identity matters. Softonic publishes SHA-256 `c0160df86193bf6a36a309d538cfd2f575842003d298e9bb191a6b3abd68f741` and labels the download **3.23.0**; the supplied file matches that hash but its verified manifest says **3.19.0**. Uptodown instead lists **3.22.0**, package `free.collection.download.read.ebook.anybooks`, ARMv7, and SHA-256 `a7376364ec4b782691ead55fcb7890f389e35ee725d489f2f0c4954ec6cc8e9e`. APKPure's inspected archive uses `com.newanybooks`. The latter two binaries were not obtained or verified locally. These identities must not be conflated with newer similarly named apps.

The supplied binary's signature, manifest, source map, bundled EPUB metadata, and service configuration have now been inspected. An Android 11 attempt crashed in ARM translation; Android 9 subsequently allowed inspection of onboarding, Library, search, Bookshelf, profile, and interface-language screens. Catalogue access remained unavailable; both observed API hostnames failed to resolve. The client does not establish permission to integrate its catalogue, nor verified evidence that AnyBooks used any of MLibrary's connected providers. Its server-side ingestion sources cannot be determined from this client alone.

### Second APK: BookHub 1.1.0

The subsequently supplied `com.freenovel.anybooks.bookhub-1.1.0.apk` was also inspected and tested on Android 9. It uses the **same signing certificate** as AnyBooks 3.19.0, with a different package and the production API `https://api.bookhubapp.com`. Its download code takes a resource URL from book metadata. DNS succeeds for that API, but ordinary HTTPS requests timed out from this environment; the app's Library did not load book records, search returned a no-results message, and its shelf stayed empty. Both observed language menus offered English, Hindi, and Tamil.

No working catalogue or book download source was obtained. The app advertises a contributor portal at `https://bookhubapp.com/create`, with Facebook sign-in and a form for uploading the contributor's own content; this does not establish where every catalogue book originated. The Gutenberg reference inside bundled FBReader resources is an example URL for adding a custom catalogue, not evidence that BookHub ingested Gutenberg. See the [BookHub investigation and comparison](BOOKHUB-AUDIT.md) for verified endpoints, APK identity, screenshots, and limits.

## Data rules

1. Keep stable provider IDs and the original source URL on every edition.
2. Separate metadata discovery, source borrowing, public-domain text, and licensed downloads.
3. Preserve language, format, attribution, license evidence, retrieval time, and jurisdiction where stated.
4. Deduplicate identical provider IDs. Match cross-source works only with sufficient author, edition, identifier, and translation evidence.
5. Do not bypass DRM, authentication, borrowing limits, or provider rate controls.
6. Use official bulk dumps for bulk ingestion. Use live APIs for user-triggered discovery and fresh availability checks.


See [Safahat, Gallica and QDL findings for 1.2.0](COLLECTIONS-1.2.md) for the latest supported routes and remaining access blocker.

Android 1.3 adds a [QDL browser and download-to-reader handoff](QDL-BROWSER-1.3.md). It also accepts PDF/EPUB/TXT files through Android Open with / Share. This is a user-assisted download route, not an automated QDL catalogue connection.

Version 1.4 adds a QDL home shortcut and selected manuscript links verified against QDL's own records: [Thābit ibn Qurrah's treatise on the solar year](https://qdl.qa/en/archive/81055/vdc_100023697729.0x000001), [Qusṭā ibn Lūqā's treatise on the celestial globe](https://www.qdl.qa/en/archive/81055/vdc_100157836372.0x00000c), and [three treatises on astrology, astronomy and time-keeping](https://www.qdl.qa/en/archive/81055/vdc_100025475046.0x000001). They open the publisher browser and use its PDF import route; these links do not add an automated QDL search feed or imply every record has a downloadable PDF.

## Scan recognition (1.4)

The reader renders a user-selected PDF rectangle at up to 2400 pixels per edge, then recognizes the resulting image. OCR text is editable and must be reviewed before quoting. The quote retains the original book title, authors, page and rectangle; OCR text offsets are never treated as PDF text-layer offsets.

[OCR.space's API](https://ocr.space/ocrapi) is optional. `server/ocr.mjs` reads `OCR_SPACE_API_KEY` from Netlify's environment and uses engine 2 with automatic language detection. The API accepts only bounded PNG/JPEG image data, never a remote URL. Only the selected area is uploaded. There is a best-effort per-instance burst limit, a 25-second provider timeout, generic error responses and no saved image payloads. Provider quotas still apply. The key must never use a `VITE_` prefix or appear in code, logs, repository files or APK assets. The current account uses a standard Netlify environment variable, approved by the owner; functions-only scopes and Secrets Controller were rejected by Netlify. [Netlify encrypts environment-variable storage](https://docs.netlify.com/build/environment-variables/secrets-controller/).

[Tesseract.js](https://github.com/naptha/tesseract.js) supplies on-device OCR for English, French and Arabic. Worker, WebAssembly core and language models are bundled with Android; the web service worker caches them after use. Language models are packaged uncompressed because Android's asset packager automatically expands `.gz` files and removes their extension. No language pack is fetched from a third-party CDN. Web users must load a language pack before using it offline.

Page curls use [StPageFlip](https://github.com/Nodlik/StPageFlip) with temporary snapshots; selectable reader content returns after the turn. Reduced-motion preferences disable the animation. Quote previews and PNG exports use the same canvas renderer, including Arabic shaping and pagination for long passages.
