# QDL browser and Android imports — 1.3.0

From **Our sources → Qatar Digital Library → Browse & import PDF**, open QDL or paste a QDL book address. The website opens in a separate on-device browser. Complete any verification yourself, navigate to a book and choose its PDF download. Once a complete supported download finishes, MLibrary returns automatically, stores the original PDF offline and opens its own reader.

If QDL rejects the embedded browser, choose **Open browser**. Download in Chrome and choose **Open with MLibrary** or **Share → MLibrary** on the downloaded file. Android returns to the app and imports it, including when the app was closed. Android does not let MLibrary silently observe Chrome's downloads; this final Open with / Share action is necessary. Sharing a website link is not the same as sharing the downloaded file.

On the website, QDL opens in another tab. Download there and use MLibrary's existing file importer. Automatic native handoff is Android-only.

## Boundaries and recovery

- QDL's embedded browser has no app JavaScript bridge, injected scripts, challenge automation, file access, mixed content or SSL-error bypass. Its browser session stays on the device. It does not grant access to Netlify or other users.
- Native QDL downloads accept only HTTPS QDL PDF download paths on `qdl.qa` / `www.qdl.qa`, including each redirect. Requests use the same device's browser user agent and publisher session. Verification pages, unsuccessful responses and truncated files fail explicitly; no automatic challenge retries occur.
- Files are limited to 50 MiB. Android Open with / Share supports PDF, EPUB and TXT content URIs with a read grant. Internal app content providers and executable file types are rejected. PDF and EPUB signatures are checked before staging and importing.
- Files first enter a private, bounded queue (three pending books). Completed downloads persist across activity/process restarts. Interrupted partial downloads are removed. The staging file is deleted only after IndexedDB content and the shelf are saved. A storage error offers Retry or Dismiss; Dismiss removes that pending copy.
- Content hashes deduplicate repeated imports. Existing highlights, progress and tags for the same imported file remain intact. QDL page attribution is saved without URL query parameters; imported external files retain their file name and personal-copy attribution.
- Download cancellation removes partial files. Closing the browser cancels an active download. Downloads do not continue as a background service.
- Scans display their original pages. Text selection/highlights depend on whether the PDF contains a text layer; this change does not add OCR.

## Availability

Verified on 10 November 2026 in the Android API 35 emulator: QDL's [Elwon coastal drawings record](https://www.qdl.qa/en/archive/81055/vdc_100023807156.0x000001) loaded in the embedded browser without an interactive challenge. Its offered PDF downloaded on-device: **9,975,657 bytes, 13 pages**, SHA-256 `8660cd7b2f775242021aa875fa6ce39cf545f9b2652f0316b8bb7b3dd012529a`. MLibrary imported the original file, rendered the scanned pages, turned pages offline and restored page 2 after an offline reload. The actual Android display was inspected; browser debug screenshots alone can omit the composited PDF canvas.

This verifies one real public record and the on-device route. It does not establish availability for every QDL record, network or future session.

QDL's backend routes previously returned Cloudflare HTTP 403 verification pages for search, metadata, IIIF and PDF requests. This release provides an on-device, user-assisted route. It does not claim that QDL's catalogue API is unlocked, that every PDF is offered, or that Cloudflare accepts every Android WebView. A real QDL verification/download still requires a successful user session and the provider's permission.

Relevant platform references: [Android DownloadListener](https://developer.android.com/reference/android/webkit/DownloadListener), [Android receiving shared content](https://developer.android.com/training/sharing/receive), [Cloudflare supported browsers](https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/), [Cloudflare challenge passage](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/challenge-passage/).

## Validation

- 41 backend tests, 7 native unit tests and 3 Android instrumentation tests passed.
- Browser tests cover cold-start pending imports, duplicate files, shelf-storage failure/retry, a rejection arriving during a queue check, publisher URL validation and offline reopening.
- `node scripts/android-import-smoke.mjs` passed on the API 35 emulator: Android Open with registration, cold-start PDF import, byte-for-byte offline length, warm Share events, deduplication, rejection of an HTML verification page named as PDF, dismissal/recovery and offline reload/reopening. It operates only on emulator serials and restores the previous interface language.
- The real QDL PDF evidence above additionally verifies the publisher download path, scanned page rendering and saved reading position. Browser content was checked to have no `window.Capacitor` bridge.
- APK version 1.3.0, versionCode 7, uses the same local signing certificate as 1.2.0; installing over the previous app preserved its shelf.

APK SHA-256: `14535deaa8373a2a4f9408d5df1114f0cb9412346a6edd05d594bbb99ea0e0b5`.
