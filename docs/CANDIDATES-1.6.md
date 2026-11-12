# Candidate sources connected in 1.6.0

Checked 12 November 2026. These are **11,157 source editions**, not 11,157 unique works. Editions can overlap with the existing catalogue.

| Source | Indexed editions | Reading route |
| --- | ---: | --- |
| Faded Page | 9,025: 8,759 English, 266 French | Search or paste a book page. The backend establishes the ordinary page session, downloads the advertised EPUB/PDF and sends validated chunks to the offline reader. Older alphanumeric IDs are supported. |
| Global Grey | 1,653 English editions from 78 category pages | Search or paste a book page. Resolve old/new page locations and the publisher’s EPUB/PDF buttons. Download only the selected book; preserve the original branding and credits. |
| Unglue.it | 479: 464 English, 15 French | Search the growing public OPDS snapshot or paste a work URL. Use its EPUB acquisition links; individual-work feeds sometimes advertise only MOBI even when an EPUB exists. The indexed acquisition avoids that failure; unindexed works use their public page buttons when needed. |
| Anna’s Archive | Browser-assisted; no imported record count | Android’s isolated publisher WebView opens a language-aware search. The user completes provider verification and chooses an available EPUB/PDF. Supported downloads are staged locally and imported automatically. Other hosts use the external browser and Share/Open with MLibrary. Web users download then import. |
| Open SLUM | Status monitor, no books | A cached status view reports only the three configured Anna domains. PROTECTED means verification; UP is not evidence that a book can be read. The monitor cannot add trusted domains. |

No Arabic editions were present in this initial candidate snapshot. Existing Arabic sources remain available. Faded Page language counts are checked against the publisher’s facets instead of guessing language from titles.

## Refresh and storage

`npm run catalog:community` refreshes metadata. The weekly GitHub catalogue workflow runs it alongside OpenITI, checks the result, commits it and triggers the existing verified Netlify deployment pipeline. Search reads `server/data/community.json.gz`; `/api/community-status` reports its timestamp and coverage.

Faded Page and Global Grey category metadata are fully traversed. Unglue.it is deliberately incremental: each run revisits five recent pages and advances by at most 80 more pages, retaining its cursor. Its advertised 250,000+ catalogue is **not** claimed as imported. `--resume` reuses downloaded metadata during a local interrupted run; `--pages=20` can bound a repair run. Requests are sequential and paced; transient transport failures get one retry. Denial and rate-limit responses stop the refresh. Failed workflows never deploy a partial refresh.

Only metadata is bundled. Selected publisher files have a 50 MiB limit and a bounded, short-lived backend memory cache. Download ranges, byte signatures, declared sizes, redirects and approved HTTPS hosts are checked. HTML verification pages cannot become book files. Client and native import publish only completed downloads. Original files and credits are retained.

The native browser has no JavaScript bridge to publisher pages. Session cookies stay on the device. Source attribution strips private query tokens. No Anna account key, membership, DRM removal or challenge automation is supplied by this integration.

## Validation and limits

[Live download evidence](candidate-validation-1.6.json) records five complete EPUB packages, including French editions from Faded Page and Unglue.it, Global Grey’s *On Liberty*, and a 37,485,310-byte Unglue.it book. These checks validate the EPUB mimetype, container and content entries. They are representative checks, not an assertion that every indexed edition was downloaded.

Browser tests cover each source’s download/import/offline-reopen path, Anna query/language handoff, and honest monitor status. Backend tests cover language filtering, legacy IDs, namespaced OPDS fields, numbered pagination, publisher sessions, malformed URLs and rejected HTML. Native tests cover publisher host boundaries, file limits/signatures and stripping private parameters.

All three configured Anna domains were reported PROTECTED during the live monitor check. Completing its live challenge or successfully downloading an Anna book remains provider- and user-session-dependent. It is not a working anonymous Netlify search API. Unknown Unglue.it publisher hosts likewise require the ordinary browser/download/import route.

## Publisher references

- [Unglue.it API documentation](https://unglue.it/api/help): public OPDS/ONIX and work identifiers.
- [Faded Page catalogue](https://www.fadedpage.com/allbooks.php): public book listings. Its editions are public domain in Canada; status elsewhere can differ.
- [Global Grey terms](https://www.globalgreyebooks.com/terms-conditions.html): personal reading and preservation of publisher branding; this implementation does not bulk rehost its books.
- [Open SLUM](https://open-slum.org/): availability observations, distinct from file readability.
- [Earlier Anna client investigation](FMHY-SCOUT.md#follow-up-the-user-supplied-rust-client): verified package provenance and browser/session requirements.
