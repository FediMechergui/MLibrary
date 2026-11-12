# FMHY catalogue scouting — 12 November 2026

FMHY is useful for finding providers, but it is not a book catalogue feed. Its first ebook entry is Open SLUM, a status monitor; Anna's Archive is the first book catalogue. This pass investigated those two plus Unglue.it, Faded Page and Global Grey. [Directory](https://fmhy.net/reading), [Open SLUM](https://open-slum.org/).

The [17 recorded probes](fmhy-scout-2026-11-12.json) used local Node HTTPS and a fresh headless Edge context, without accounts or challenge cookies. They do not establish Netlify-region availability. No catalogue records were added to production during this scouting pass.

## Anna's Archive: bulk indexing or session-based live search

The documented custom-search route is to load its Elasticsearch/MariaDB exports. Its stable JSON API supplies fast download URLs for members; free downloads involve browser verification and sometimes queues. This is not a documented anonymous search API. [FAQ](https://annas-archive.gl/faq#api).

The listed February 2026 derived metadata snapshot is **1.5 TB across 935 files**, before our own filtering/indexing. The dataset overview combines books with papers and other material, so its total must not be advertised as a unique readable-book count. [Metadata exports](https://annas-archive.gl/torrents#aa_derived_mirror_metadata), [dataset overview](https://annas-archive.gl/datasets).

Observed here:

- Homepage: HTTP 200. English, French and Arabic searches: HTTP 403 challenge pages.
- A normal browser search for *Les Argonautes* also returned DDoS-Guard, with no book-record links. This did not verify that title's availability.
- The documented download endpoint returned its parameter documentation and HTTP 400 `Invalid md5` for an empty request. Its documented `key` parameter requires a member account. No account key was requested or used, and no protected book was downloaded.

**Recommended architecture:** start with a bounded metadata pilot, selecting English/French/Arabic book editions. Preserve source IDs, ISBNs, language, formats and availability evidence. Deduplicate editions against existing sources by identifiers, not just titles. Run ingestion and a persistent search index outside Netlify functions; keep Netlify as the API layer. Resolve a matching accessible edition before offering in-app reading. Discovery metadata alone must not set `access: read`. File-level authorization and license evidence remain separate from metadata availability.

The export's storage footprint makes loading the full mirror into our current compressed function snapshots impractical. A small extraction pilot should establish language coverage, duplicates, disk/RAM requirements and incremental refresh behavior before infrastructure is selected. No full mirror was downloaded.

### Follow-up: the user-supplied Rust client

The [`annas-archive-api` crate](https://lib.rs/crates/annas-archive-api) adds a third option: **live, user-assisted searches without importing the full metadata mirror**. This makes the earlier bulk-index recommendation incomplete for an optional personal connection.

I inspected published version **0.3.0**, dated 5 October 2026, and verified its archive against the crates.io SHA-256. Its package points to commit `593b4bf89ff308244080b368f5150838cb9e3e91` of `RemiKalbe/annas-archive-mcp`; similarly named Node projects are separate software.

The client parses `/search` HTML. It can log in using an account secret, checks `/dyn/up/`, reads authenticated item JSON and requests member download URLs. Its search options expose query/page, so MLibrary would need language/format filtering. [Published client source](https://github.com/RemiKalbe/annas-archive-mcp/blob/593b4bf89ff308244080b368f5150838cb9e3e91/annas-archive-api/src/client.rs).

Its browser helper launches local Chrome, waits for the user to complete verification, then reuses that browser's cookies. This requires a browser on the client machine; it is not a hands-off Netlify function workflow. [Browser helper](https://github.com/RemiKalbe/annas-archive-mcp/blob/593b4bf89ff308244080b368f5150838cb9e3e91/annas-archive-api/src/browser.rs).

An [anonymous endpoint probe](anna-crate-probe-2026-11-12.json) reproduced its URLs/session-cookie flow in Node: `/dyn/up/` returned 200 and logged-out status, then search returned 403 DDoS-Guard. The Rust binary and interactive/authenticated path were not executed. Therefore the crate is a useful implementation reference, not verified anonymous access from our deployment.

**Revised integration option:** prototype an optional Anna connection using same-device browser verification and its permitted account/download flow. Adapt the session handling to Android and our Node backend; test session expiry and file import before enabling it. Do not assume a phone's verification session transfers to Netlify. A fully independent catalogue still needs the separate metadata-indexing architecture above.

## Other candidates with verified routes

| Candidate | Evidence | Integration decision |
| --- | --- | --- |
| **Unglue.it** | Its anonymous OPDS navigation feed and an EPUB acquisition feed returned 200. The sampled acquisition page includes English and French records with license attributes. Two acquisition links returned real EPUB byte ranges: *Le temps des loups* (1,298,708 bytes) and *Mapping and the Citizen Sensor* (37,485,310 bytes). A French title-search request returned 503. | Best next adapter for readable additions. Ingest paginated metadata into a cached local index; retain language, ISBN and each acquisition link's license. Validate redirects and files before automatic import. Add timeout/cooldown handling instead of depending on live title-search availability. |
| **Faded Page** | The live catalogue reported **9,210 records**. Direct EPUB requests redirected to HTML book pages despite HTTP 206. The ordinary browser download of *Flatland* produced a 374,810-byte EPUB with the correct MIME entry, container and 30 HTML files. | Promising English/French addition. Implement its ordinary book-page download flow; do not accept HTTP 200/206 alone as a file. The exact cookie/referrer dependency was not isolated. Preserve its item-level Canadian public-domain statement and check applicability before redistribution. |
| **Global Grey** | Homepage returned 200. The publisher advertises public-domain EPUB/PDF downloads and has specific personal-use/redistribution terms. No book file was tested in this pass. | Secondary candidate for edition links and personal imports. Review the file-use conditions before a bulk adapter or hosted collection. |
| **Open SLUM** | Status page returned 200. Its `PROTECTED` status explicitly means book content was not verified; even some healthy download endpoints intentionally return 403 for invalid links. | Useful monitoring input, not catalogue ingestion or proof of reader availability. |

Provider references: [Unglue.it API and feeds](https://unglue.it/api/help), [sample acquisition feed](https://unglue.it/api/opds/epub/-gtbg/-doab/?page=1), [Faded Page catalogue](https://www.fadedpage.com/allbooks.php), [Flatland formats and rights](https://www.fadedpage.com/showbook.php?pid=20140519), [French sample](https://www.fadedpage.com/showbook.php?pid=20220141), [Global Grey terms](https://www.globalgreyebooks.com/terms-conditions.html).

Unglue.it advertises over 250,000 free ebooks, but that includes overlap with providers already in MLibrary. Its provider-exclusion filters are useful for sampling, not proof of cross-catalogue uniqueness. New unique EN/FR/AR totals remain unmeasured; Arabic additions were not verified in its sampled feed. [Publisher homepage](https://unglue.it/).

## Practical order

1. Add Unglue.it metadata ingestion and licensed EPUB/PDF resolution, with a small sample validated in MLibrary's reader before scaling.
2. Add Faded Page metadata and its browser-compatible download/import route, preserving rights statements and file validation.
3. Prototype Anna's session-based personal connection using the inspected crate as a reference. Independently size a metadata pilot if MLibrary needs its own complete index; anonymous server requests remain challenged.

Run `node scripts/scout-fmhy.mjs` to repeat bounded HTTP/feed/file-header checks. `--files-only` appends file probes to an existing `artifacts/fmhy-scout.json`. The recorded browser test is separate: open the public Flatland detail page, click its EPUB link, then inspect the downloaded EPUB container. Header probes are not a replacement for full reader integration tests.
