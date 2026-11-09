# MLibrary

A multilingual book-discovery and reading app for the web and Android. React 19, TypeScript, Capacitor 8, and a Netlify Functions backend.

**Website:** https://mlibrary-fedimechergui.netlify.app

**Repository:** https://github.com/FediMechergui/MLibrary

## Working features

- A locally searchable snapshot of **66,386 Gutenberg text records** as imported on 9 November 2026: 62,161 English, 4,252 French, and 1 Arabic. Language counts overlap because some records are multilingual. These are catalogue records, not a claim that every edition is available in every country.
- Live Wikisource search in Arabic, French, and English; Open Library and Internet Archive discovery. Source editions remain separate. Wikisource results can be chapters or contents pages.
- English, French, and Arabic interface translations and RTL layout.
- Full-text reading, animated page turns, paged and continuous reading, paper/sepia/night themes, font controls, bookmarks, and progress restoration.
- Imported EPUB and PDF reading; EPUB scripts are disabled. PDF keeps the source layout. Files up to 50 MB can be imported from the device.
- Persistent four-color highlights, notes, and passage anchors in text, EPUB, and selectable PDFs. Image-only PDFs require a text/OCR layer for automatic selection.
- **My Quotes**: saved passages, favorites, search, tags, editable notes, return to passage, and three PNG card styles. Android cards use the native save/share chooser. You can also enter a quote manually.
- Book tags and reading preferences for subjects, purposes, and languages; preferences reorder the starter collection. Focus mode hides reader controls.
- Internal Wikisource chapter navigation. Open Library resolves language-matched Internet Archive editions and checks alternatives when needed. Publicly downloadable text, EPUB, and PDF files open in **MLibrary's own reader**. Large PDFs use page-range requests, up to 500 MB online; offline files are limited to 50 MB. Book opening never falls back to a provider website. Editions without an accessible file offer importing your copy or searching for another edition.
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

Languages: `en`, `fr`, `ar`, `all`. Sources: `gutenberg`, `wikisource`, `openlibrary`, `archive`, `all`. Pages are bounded at 100 per query; refine the query to reach more editions. No endpoint accepts an arbitrary content URL. Search caches use 512 bounded slots. Upstream requests have timeouts; readable text downloads are limited to 4 MiB.

## Android

Requires JDK 21 and Android SDK platform 36 to build; **Android 8.0 (API 26) or later** to install. In-app browser data isolation is provided by Android 9+; Android 8 shares WebView storage. The APK bundles the interface, fonts, and starter books. It uses the deployed HTTPS backend for discovery and online reading.

```powershell
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:VITE_API_BASE_URL = 'https://mlibrary-fedimechergui.netlify.app'
npm.cmd run android:build
```

The installable development build is copied to `artifacts/MLibrary-debug.apk`. For macOS/Linux, build the web app with `VITE_API_BASE_URL`, run `npx cap sync android`, then `./gradlew assembleDebug` inside `android`. GitHub Actions can also build the APK on demand. Play Store publication requires a permanent signing key and release setup.

For a native smoke test, install and launch the debug APK on a disposable emulator. Find its PID with `adb shell pidof app.mlibrary.reader`, then run `adb forward tcp:9223 localabstract:webview_devtools_remote_<PID>`. Run `node scripts/android-smoke.mjs --reset`; the explicit reset clears this app's shelf and settings on the test device. The script checks the native runtime, reading controls, offline reopening, and Arabic RTL through the app's WebView and writes screenshots to `artifacts/`.

Book files live in IndexedDB. Shelves, progress, highlights, notes, quotes, tags, and preferences live in local storage. The existing version-1 storage key is migrated with defaults for new fields. Clearing app/site data removes them. Progress export includes this metadata, not book files. No user account or server-side personal reading history is created. The source directory and attribution links can open source information in an in-app browser; these pages are never used as the book reader. Run the native smoke test with `--reset --notes --books` to check quote sharing and real online editions in the app's own reader.

Run `npm run icons` to regenerate web PNGs, Android launcher images, and splash screens from `public/icon.svg`. The Android adaptive foreground is the corresponding vector in `android/app/src/main/res/drawable/mlibrary_mark.xml`.

## Deploy

```sh
npm run build
netlify deploy --prod --dir dist --functions netlify/functions --no-build
```

`netlify.toml` defines routes, headers, bundled catalogue data, and the update schedule. The functions use a small Lambda wrapper because the local Windows filesystem did not support the CLI's V2 NFT bundler. Application logic remains standard `Request`/`Response` code in `server/`.

GitHub Actions runs checks on pushes to `main`; deployment uses the authenticated local Netlify CLI. Automated approval review rejected transferring the local Netlify token into GitHub secrets, so no credential transfer or GitHub deployment job is configured. Netlify's scheduled catalogue refresh operates independently. Keep signing files, `.env`, `.netlify`, and device data out of Git.

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
