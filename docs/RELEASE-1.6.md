# MLibrary 1.6.0

Faded Page, Global Grey and Unglue.it now appear in catalogue search and source controls. Choosing a supported edition downloads the publisher’s EPUB/PDF, saves it offline and opens it in MLibrary’s own reader. Paste individual book links in each source’s settings to import editions directly.

- **Faded Page:** 9,025 English/French editions; ordinary publisher sessions fix links that previously returned HTML. Legacy alphanumeric book IDs are supported.
- **Global Grey:** 1,653 English editions; original files, branding and credits retained.
- **Unglue.it:** 479 English/French editions in a growing OPDS snapshot. The format-selection resolver recovers EPUB links omitted from individual-work feeds.
- **Anna’s Archive:** language-aware browser search and download-to-reader handoff on Android. Provider verification and account requirements still apply; unknown download hosts use the external browser and Share/Open with MLibrary. On the web, download then import.
- **Open SLUM:** a cached status view for the three configured Anna domains. PROTECTED is shown as verification required, without implying that the books are downloadable.

The 11,157 records are source editions, with possible overlap with existing libraries. No Arabic editions were present in this initial candidate snapshot; existing Arabic catalogues remain available. Weekly metadata refresh extends Unglue.it incrementally and refreshes Faded Page and Global Grey. No bulk publisher book files are bundled or rehosted.

The Android publisher browser keeps sessions on-device, uses fixed trusted hosts and imports completed files only. Existing books, highlights, quotes and progress remain compatible. New publisher downloads are limited to 50 MiB per file. [Implementation and live sample evidence](CANDIDATES-1.6.md).

## Install

Use **MLibrary-1.6.0.apk** to update the existing development-signed MLibrary installation. It retains the previous signing identity and uses Android version code 10. Do not uninstall your app to update.

The separate **MLibrary-1.6.0-store.apk** and **MLibrary-1.6.0-store.aab** use the existing private upload certificate and are not replacements for the development-signed APK. A Play Console account is still required for Play Store publication. `SHA256SUMS.txt` identifies the exact published files.

Anna’s live challenge remains provider-dependent. This release does not claim anonymous server access to its full catalogue or that every indexed publisher file has been downloaded and tested.
