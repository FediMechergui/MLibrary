# MLibrary

A multilingual book-discovery and reading app for the web and Android. React 19, TypeScript, Capacitor 8, and a Netlify Functions backend.

**Website:** https://mlibrary-fedimechergui.netlify.app

**Repository:** https://github.com/FediMechergui/MLibrary

**Version 1.6.0:** [Android release](https://github.com/FediMechergui/MLibrary/releases/tag/v1.6.0). Faded Page, Global Grey and Unglue.it add **11,157 source editions** with automatic download into the offline reader. Anna’s Archive has browser-assisted search/import; Open SLUM supplies provider status. [Coverage, verification and limitations](docs/CANDIDATES-1.6.md).

**Version 1.5.0:** [Android release](https://github.com/FediMechergui/MLibrary/releases/tag/v1.5.0). Portable backups with offline book files, optional encrypted device sync, 7,098 primary Arabic OpenITI editions, 710 French Gallica texts, automatic checked deployments, and a separately signed store bundle. [Release details](docs/RELEASE-1.5.md) · [Play preparation](docs/STORE-READINESS.md).

**Version 1.4.0:** [Android release](https://github.com/FediMechergui/MLibrary/releases/tag/v1.4.0). Rectangle OCR for scanned pages, editable book metadata, a quote-card studio with Story/square/portrait/landscape exports, real page curls, and QDL shortcuts on Discover. Existing shelves and quotes remain compatible.

**Version 1.3.0:** [Android release](https://github.com/FediMechergui/MLibrary/releases/tag/v1.3.0). QDL browser with PDF download-to-reader handoff, plus Open with / Share to MLibrary for PDF, EPUB and TXT. [Flow, real-record verification and limitations](docs/QDL-BROWSER-1.3.md). Any interactive verification is performed by the user; automated QDL catalogue access remains blocked.

**Version 1.2.0:** [Android release](https://github.com/FediMechergui/MLibrary/releases/tag/v1.2.0). Safahat public PDF link imports and 232 searchable French Gallica texts from BnF's official bulk collection. [Evidence and QDL access limits](docs/COLLECTIONS-1.2.md). QDL remains blocked; no access controls are bypassed.

**Version 1.1.0:** [Android release](https://github.com/FediMechergui/MLibrary/releases/tag/v1.1.0). DOAB adds 38,614 searchable English/French/Arabic book records, an OAPEN subset, and public-repository downloads into the reader. [Integration evidence and remaining limits](docs/OPENACCESS-1.1.md). Supported publisher hosts are OAPEN and Ledizioni; other provider restrictions remain explicit. The open-access metadata snapshot has a daily Netlify refresh with a bundled fallback.

**Version 1.0.0:** [Android release](https://github.com/FediMechergui/MLibrary/releases/tag/v1.0.0) · [all-source audit](docs/SOURCE-AUDIT-1.0.md).

This release adds saved source controls, actionable availability reasons, format selection and fallback recovery, an individual Standard Ebooks link importer, and a burgundy/porcelain interface with compact mobile layouts and 44px reader controls. Existing shelves, offline books and quote cards migrate automatically.

## Working features

- A locally searchable snapshot of **66,386 Gutenberg text records** as imported on 9 November 2026: 62,161 English, 4,252 French, and 1 Arabic. Language counts overlap because some records are multilingual. These are catalogue records, not a claim that every edition is available in every country.
- Live Wikisource search in Arabic, French, and English; Open Library and Internet Archive discovery. Source editions remain separate. Wikisource results can be chapters or contents pages.
- English, French, and Arabic interface translations and RTL layout.
- Full-text reading, animated page turns, paged and continuous reading, paper/sepia/night themes, font controls, bookmarks, and progress restoration.
- Imported EPUB, PDF, TXT, PNG, JPEG and WebP reading; images become local PDFs. EPUB scripts remain disabled. Book title, authors, language, year and description are editable; embedded PDF/EPUB metadata supplies initial values. Files up to 50 MB can be imported from the device.
- Persistent four-color highlights, notes, and passage anchors in text, EPUB, and selectable PDFs. For scans, choose **Quote from scan**, draw a rectangle, extract and correct the text, then quote a selection. English, French and Arabic OCR runs locally with bundled Tesseract models or through the optional OCR.space backend. Only the selected image area is sent online, after pressing Extract text. OCR quotes keep their source page and rectangle.
- **My Quotes**: attributed passages, favorites, tags, notes and return to passage. The card studio offers four layouts, four export formats, font/size/spacing/alignment/margins, custom colors, background images and attribution toggles. Long quotes continue across multiple cards. Story exports are 1080 × 1920 PNGs; Android uses the system share chooser, where users choose an installed target or save for later upload. Instagram availability depends on the installed app.
- Book tags and reading preferences for subjects, purposes, and languages; preferences reorder the starter collection. Focus mode hides reader controls.
- Internal Wikisource chapter navigation. Open Library resolves language-matched Internet Archive editions and checks alternatives when needed. Download-only EPUB and PDF editions download, save to My Library, and open automatically in **MLibrary's own reader**. Archive/Open Library full-text downloads are also saved automatically. Progress, cancellation, and retry keep incomplete files out of offline storage. Source downloads support EPUBs up to 50 MB and PDFs up to 500 MB, subject to device storage. PDFs are stored as blobs and read in local page ranges. Book opening never falls back to a provider website. Editions without an accessible file offer importing your copy or searching for another edition.
- Saved shelves, device-local offline book files, daily goals, active reading time, streaks, and milestones.
- Two bundled complete starter books, _Pride and Prejudice_ and _Alice’s Adventures in Wonderland_, with the original Gutenberg license text preserved.
- Hourly scheduled checks of Gutenberg's official CSV feed, conditional requests, a validated compressed snapshot in Netlify Blobs, a bundled fallback, and cached federated queries.
- Android project, launcher icon, splash screen, system back-button handling, and APK build scripts.

Version 0.2 adds the reading room redesign and a new book/bookmark identity. Catalogue records without an available edition remain unavailable for full reading. Public access does not relabel a book as public domain; original rights statements are retained, and restricted, dark, private, or encrypted files are excluded. An imported copy can be read inside the app. Accounts, cross-device sync, OCR ingestion, full-text indexing of millions of works, audio, and a Play Store release remain future work. The product is free to use; upstream services and hosting still have quotas and possible operating costs.

## Run locally

Use Node 22 or later.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. The development API runs on port 8889. On Windows use `npm.cmd` if PowerShell's execution policy blocks `npm.ps1`.

```sh
npm test
npm run build
npm run test:e2e
```

Browser tests use installed Microsoft Edge locally and Chromium on CI. Fixtures are in `tests/fixtures`; regenerate them with `node scripts/test-fixtures.mjs`.

## Catalogue and updates

`npm run catalog:seed` refreshes the checked-in compressed Gutenberg snapshot and featured records. It downloads the official CSV feed, not book-page HTML. Gutenberg publishes that CSV on its own cadence; hourly checks do not make upstream data more recent.

Production's `catalog-sync` scheduled function runs at minute 17 of each UTC hour. It uses `If-Modified-Since`, validates a complete download before replacing the index, and retains the old snapshot after failures. Inspect `/api/sync-status` for the last attempt, successful refresh, and record counts. The schedule only runs on production deploys.

Set `CATALOG_CONTACT` in Netlify to a monitored operator email to identify requests to external libraries. Netlify automatically supplies Blobs credentials to deployed functions. No API keys belong in the frontend.

The Gutenberg CSV has no copyright field. Before serving an online Gutenberg text, the backend checks the edition's RDF rights statement for US public-domain status. Other permissions and regional status are referred to the source. The app does not bypass borrowing, access controls, or DRM. See [sources and research](docs/SOURCES.md).

## API

| Endpoint                                            | Purpose                                                      |
| --------------------------------------------------- | ------------------------------------------------------------ |
| `GET /api/search?q=&language=all&source=all&page=1` | Search with source-level totals and partial-failure status   |
| `GET /api/content?id=gutenberg:84`                  | Rights-checked Gutenberg text                                |
| `GET /api/content?id=wikisource:ar:123`             | Selected Wikisource page, attribution, and links to subpages |
| `GET /api/content?id=wikisource:fr:123&chapter=Title/Chapter` | Read a chapter belonging to the selected work |
| `GET /api/content?id=archive:ITEM` | Publicly downloadable book text/file or explicit unavailable status |
| `GET /api/content?id=openlibrary:OL123W&language=en` | Resolve a matching edition, then check its actual availability |
| `GET /api/file?id=ARCHIVE_ID&name=FILE&start=0&end=262143` | Deliver a validated public EPUB/PDF byte range, at most 1 MiB, for the app reader |
| `GET /api/sources`                                  | Integrated, discovery, and directory sources                 |
| `GET /api/sync-status`                              | Last scheduled update                                        |
| `GET /api/health`                                   | Backend health                                               |
| `GET /api/import-standard?url=BOOK_PAGE` | Resolve one public Standard Ebooks edition for automatic EPUB import |

`/content` accepts `format=auto|text|epub|pdf` for Archive and Open Library, and `standardebooks:author/title` IDs for individual publisher EPUBs. `/search` accepts `exclude=wikisource,archive` for combined searches. `/sources` includes dated audit findings and tailored recovery instructions. `SOURCE_POLICIES` configures bounded per-provider network timeouts/retries; see `.env.example`.

Languages: `en`, `fr`, `ar`, `all`. Sources: `gutenberg`, `wikisource`, `openlibrary`, `archive`, `all`. Pages are bounded at 100 per query; refine the query to reach more editions. No endpoint accepts an arbitrary content URL. Search caches use 512 bounded slots. Upstream requests have timeouts; readable text downloads are limited to 4 MiB.

## Android

Requires JDK 21 and Android SDK platform 36 to build; **Android 8.0 (API 26) or later** to install. In-app browser data isolation is provided by Android 9+; Android 8 shares WebView storage. The APK bundles the interface, fonts, and starter books. It uses the deployed HTTPS backend for discovery and online reading.

```powershell
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:VITE_API_BASE_URL = 'https://mlibrary-fedimechergui.netlify.app'
npm.cmd run android:build
```

The compatible sideload build is copied to `artifacts/MLibrary-debug.apk`. For macOS/Linux, build with `VITE_API_BASE_URL` and `MLIBRARY_NATIVE_BUILD=1`, run `npx cap sync android`, then `./gradlew assembleDebug` inside `android`. GitHub Actions also builds a development APK on demand; its certificate is not the local update certificate. `npm run android:store` produces a non-debuggable signed AAB using the protected local upload key. [Signing and Play Console steps](docs/STORE-READINESS.md).

For a native smoke test, install and launch the debug APK on a disposable emulator. Find its PID with `adb shell pidof app.mlibrary.reader`, then run `adb forward tcp:9223 localabstract:webview_devtools_remote_<PID>`. Run `node scripts/android-smoke.mjs --reset`; the explicit reset clears this app's shelf and settings on the test device. The script checks the native runtime, reading controls, offline reopening, and Arabic RTL through the app's WebView and writes screenshots to `artifacts/`.

Use `--reset --downloads-only` for a real Archive PDF download and offline scan check, or `--reset --publisher-only` for a real Standard Ebooks EPUB download, visible page turns, and offline reopening. These tests use public source endpoints and a disposable emulator. The version 1.0.0 GitHub APK uses the same local development signing certificate as 0.2.1 so it can update that installation; it is a sideloadable development-signed build, not a Play Store package.

Book files live in IndexedDB; shelves, progress, notes and preferences live in local storage. My Library → Backup & device sync exports a ZIP with optional book files and previews a validated merge when restoring. Legacy progress JSON can also be imported. Optional sync encrypts reading metadata on the device using a private recovery key; book files transfer through backups. The server stores one encrypted manifest per vault, up to 2 MiB. Keys stay on the device and cannot be recovered by the server. Disconnect and cloud deletion are available in the same panel. Clearing app/site data removes local content. The source directory and attribution links open source information separately from the native reader.

Run `npm run icons` to regenerate web PNGs, Android launcher images, and splash screens from `public/icon.svg`. The Android adaptive foreground is the corresponding vector in `android/app/src/main/res/drawable/mlibrary_mark.xml`.

## Deploy

```sh
npm run build
netlify deploy --prod --dir dist --functions netlify/functions --no-build
```

`netlify.toml` defines routes, headers, bundled catalogue data and the update schedule. Catalogue/OCR endpoints use the existing Lambda adapter. Private sync uses a modern Netlify Function with strongly consistent Blobs reads and conditional writes. Gallica texts are separate static compressed files with SHA-256 integrity checks; the function bundle holds only their index. Android excludes the collection files and fetches books on demand.

GitHub Actions runs checks on `main`, then calls a site-specific Netlify build hook stored as `NETLIFY_BUILD_HOOK`. Netlify clones the private repository with a read-only deploy key; no personal Netlify token is stored in GitHub. Hourly Gutenberg and daily DOAB/OAPEN refreshes run independently. The weekly Arabic catalogue workflow updates the pinned OpenITI snapshot when its official revision changes, validates it and dispatches checks. Keep `.private`, signing files, `.env`, `.netlify` and device data out of Git.

## Project layout

```text
src/                 React app, reader, translations, device persistence
server/              Catalogue adapters, content checks, storage, sync logic
server/data/         Compressed official Gutenberg snapshot
netlify/functions/   Deployable API and scheduled update wrappers
public/data/         Featured metadata and licensed starter texts
android/             Capacitor native Android project
tests/               Backend and browser regression checks
docs/                Sources, architecture, and next-scale plan
scripts/             Local development, catalogue refresh, APK build
```
