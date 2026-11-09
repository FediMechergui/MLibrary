# Validation

9 November 2026.

- TypeScript and Vite production build: passed.
- Dependency audit: zero known vulnerabilities at install time. EPUB's XML parser is overridden to the patched 0.9 release; PDF.js uses a patched 6.x release.
- Backend regression suite: 11 passed, including real local catalogue searches, language filtering, pagination, partial provider outages, cache behavior, identifier validation, source rights checks, download limits, API method/CORS behavior, and Netlify Lambda storage compatibility.
- Browser suite against the production build: 5 passed. Covered discovery, library persistence, page turns, bookmarks, theme changes, offline reopening after reload, French catalogue search and pagination, mobile Arabic RTL, imported TXT, reading-time milestones, PDF rendering, EPUB rendering with scripts disabled, and source-directory classifications.
- Live Netlify API smoke checks: health, French Gutenberg search, Arabic Wikisource search, and full Frankenstein text returned HTTP 200.
- Android debug APK: Gradle build passed; APK signing verification passed. APK SHA-256: `bb517ea3d9397dac62c2da9cb389adb7f36bdb826578cd17c89c418c18698323`.

Browser screenshots and APK build output are in the ignored `artifacts/` directory. Tests use original EPUB/PDF fixtures with a script in the EPUB to verify sandboxing.

The AnyBooks APK itself was not obtained or executed. Its supplied listing was used as a feature reference. See `SOURCES.md` for details and research limits.
