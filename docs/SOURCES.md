# Source research and integration status

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

The listing exposes version 3.23.0 and a historical APK hash, but the download page could not be retrieved in this run. No authenticated original APK was obtained or executed. Product observations from that listing are not presented as hands-on testing. The emulator work is for MLibrary itself.

## Data rules

1. Keep stable provider IDs and the original source URL on every edition.
2. Separate metadata discovery, source borrowing, public-domain text, and licensed downloads.
3. Preserve language, format, attribution, license evidence, retrieval time, and jurisdiction where stated.
4. Deduplicate identical provider IDs. Match cross-source works only with sufficient author, edition, identifier, and translation evidence.
5. Do not bypass DRM, authentication, borrowing limits, or provider rate controls.
6. Use official bulk dumps for bulk ingestion. Use live APIs for user-triggered discovery and fresh availability checks.
