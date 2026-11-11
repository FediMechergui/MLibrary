# Architecture and growth plan

## Current release

The React/TypeScript interface is bundled by Vite and shared between Netlify and the Capacitor Android app. Native builds set an absolute `VITE_API_BASE_URL`; web builds use the same-origin API. Reader fonts are bundled. Gutenberg starter books are included with their original license notices.

The backend connects Gutenberg, Wikisource, Open Library, Internet Archive, DOAB, OAPEN, Gallica and OpenITI search. Safahat, Standard Ebooks and QDL have individual-book/browser import flows. Each source can fail independently; errors never become invented empty catalogues. Provider totals are edition/record counts, not globally deduplicated readable-book counts. Similar titles remain separate until stronger identifiers establish identity.

Netlify Blobs holds the refreshed Gutenberg snapshot and a bounded query cache. The scheduled updater conditionally fetches the official CSV, checks that it contains a plausible complete set, then replaces the compressed snapshot. It records success only after storage succeeds. A failed update leaves the last successful index usable. The function bundle also includes a seed snapshot, so first deployment does not depend on a successful cron run.

This is suitable for a first catalogue of tens of thousands of locally indexed records and broader federated discovery. It is not a horizontally scalable search system for hundreds of millions of editions. Parsing a full snapshot in a serverless process and relying on provider APIs would become inappropriate at that scale.

Reading files are device-local and imported files are hashed to identify duplicates. Optional encrypted sync transfers reading metadata using a generated 256-bit recovery key. HKDF separates the AES-GCM encryption key from the capability authentication token. The backend verifies SHA-256(token) against the vault ID; conditional writes detect races. Per-record timestamp/device clocks retain deletions, and per-device activity counters merge without double-counting. Concurrent changes to one shelf entry use last-write-wins; independent notes merge independently. Backup ZIPs carry metadata plus optional files, validate size/type/hash before preview, and roll back file changes if metadata storage fails.

EPUB scripts remain disabled. PDF.js runs its parser in a worker. Plain text is paginated with font measurements; scroll mode uses the same logical pages. Reading time accrues only in a visible active reader. Milestones use actual activity.

OpenITI uses a pinned official release and primary Arabic editions. Long texts are split into bounded responses; complete offline downloads fetch all sections before committing. Gallica uses a small searchable metadata index and separate compressed public text files, verified against their recorded hashes. The Android package excludes these collection files.

## Next scale

1. **Persistent catalogue:** use Postgres for works, editions, authors, provider records, identifiers, licenses, availability, and ingestion checkpoints. Preserve provenance and raw records in object storage.
2. **Search service:** introduce an independently hosted search index with Arabic normalization and French/English analyzers. Index author aliases, translations, ISBN/DOI/OCLC, titles, and subjects. Avoid using title similarity alone for work identity.
3. **Bulk ingestion:** process Open Library monthly dumps and approved institutional exports with streamed, resumable workers. Netlify remains the API/control layer; multi-hour jobs run in a worker service with a durable queue.
4. **Arabic coverage:** prioritize a publisher arrangement with Hindawi/Safahat, Arabic Collections Online, and rights-reviewed Wikisource works. Distinguish a full book from a chapter or contents page. Link chapter structures into a unified edition reader.
5. **Scans:** add IIIF manifests and a dedicated image/PDF reading path, with on-demand page loading, OCR text layers, page anchors, and item-level rights. Never assume an accessible Archive item is freely redistributable.
6. **Reliability:** shared provider rate limits, Retry-After handling, monitoring, ingestion error queues, retention rules, availability revalidation, and a takedown/correction route.
7. **Personal accounts:** add optional account-based recovery and shared quota enforcement around the existing recovery-key sync. Preserve end-to-end encryption, explicit deletion, portable backups and offline access.
8. **Reading features:** extend the existing highlights, quote studio, OCR and animated page turns with dictionary lookup, text search, listening and stronger PDF accessibility.
9. **Android distribution:** use the permanent upload key and signed APK/AAB build scripts for Play enrollment; add protected CI signing, owner-supplied listing details, accessibility testing and real-device validation.

## Operating boundaries

- The first UI supports English, French, and Arabic. Other-language catalogue records are filtered out of the Gutenberg snapshot.
- Gutenberg rights checks use a US public-domain statement. They do not establish rights in every jurisdiction.
- Wikisource reads the selected page inside the app with chapter navigation; some records represent chapters or indexes rather than complete books.
- Available Archive and Open Library text, EPUB and PDF files open inside the reader. Restricted borrowing remains with the original provider.
- Online text responses are capped at 4 MiB; local EPUB/PDF/TXT imports at 50 MiB. Supported ranged PDF downloads allow up to 500 MiB. Portable backups allow 250 MiB of files, with a 50 MiB limit per file.
- Offline browser support requires a successful first visit and reader loading. Android bundles the app shell.
- Optional encrypted sync carries metadata up to 2 MiB per vault. Book files remain local and travel through backups. Browser/app data clearing removes local copies and the locally stored recovery key; a saved key or backup is needed for recovery.
- Provider totals overlap and can include parts, editions, or records with no downloadable file. Do not advertise their sum as a unique free-book count.
