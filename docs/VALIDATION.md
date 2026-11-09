# Validation

9 November 2026.

- TypeScript and Vite production build: passed.
- Dependency audit: zero known vulnerabilities at install time. EPUB's XML parser is overridden to the patched 0.9 release; PDF.js uses a patched 6.x release.
- Backend regression suite: 11 passed, including real local catalogue searches, language filtering, pagination, partial provider outages, cache behavior, identifier validation, source rights checks, download limits, API method/CORS behavior, and Netlify Lambda storage compatibility.
- Browser checks against the production build: 6 passed (the five feature tests plus the delayed-font regression). Covered discovery, library persistence, first page turns while fonts load, bookmarks, theme changes, offline reopening after reload, French catalogue search and pagination, mobile Arabic RTL, imported TXT, reading-time milestones, PDF rendering, EPUB rendering with scripts disabled, and source-directory classifications.
- Live Netlify API smoke checks: health, French Gutenberg search, Arabic Wikisource search, and full Frankenstein text returned HTTP 200.
- Android debug APK: Gradle build passed; APK signing verification passed. APK SHA-256: `84791f1847a2caa32faa4806c7f580d6d3588552ee7b129fcaed4f71f1460e72`.
- Android 15 emulator: APK installed and launched. Native WebView checks passed for Capacitor runtime, mobile layout without horizontal overflow, book loading, first page turn, night theme, offline saving and reading after an offline app reload, and Arabic RTL. The test exposed an initialization race; the reader now waits for its font, initializes navigation before reporting readiness, and preserves navigation intent during repagination. A browser regression holds font downloads to exercise that case.
- Scheduled production updater: verified a successful Netlify Blobs write of 66,386 records at 11:08 UTC, followed by a conditional unchanged-feed run. The temporary one-minute verification schedule was restored to minute 17 of each hour.

Browser screenshots and APK build output are in the ignored `artifacts/` directory. Tests use original EPUB/PDF fixtures with a script in the EPUB to verify sandboxing.

The AnyBooks APK itself was not obtained or executed. Its supplied listing was used as a feature reference. See `SOURCES.md` for details and research limits.
