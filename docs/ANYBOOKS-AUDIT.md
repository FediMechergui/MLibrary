# AnyBooks APK inspection

Inspected 9 November 2026. This report concerns the exact APK supplied by the user, not every application distributed under the AnyBooks name.

## Findings

The app successfully opened on an Android 9 emulator. Its Library, search, Bookshelf, profile, and interface-language screens were inspected. The client uses an AnyBooks catalogue API, with `https://api.anybooks.live` as its bundled production default. Runtime DNS traffic confirms that it attempted to contact this hostname. Search and book details are requested from that service; a separate request obtains a book's download location. The client does not contain a complete catalogue or a confirmed list of upstream book suppliers. No working online catalogue access was established in this inspection.

The bundled production hostname failed local DNS resolution, and Google's public DNS resolver returned `SERVFAIL` with a nameserver-refusal diagnostic. After a normal app restart, the emulator also queried **`api.anybooks.mobi`**, which returned `NXDOMAIN`; Google's public DNS independently confirmed this. The change is consistent with the client's persisted remote-configuration mechanism, although the configuration response itself was not intercepted. The developer website's `www.anybooks.app` hostname also returned `NXDOMAIN`. These are observations at the time of the test, not proof that all historical services or other versions are permanently unavailable.

## File identity

| Property | Observed value |
| --- | --- |
| Supplied file | `anybooks-read-free-books-novels-and-stories.apk` |
| File size | 24,576,485 bytes |
| SHA-256 | `c0160df86193bf6a36a309d538cfd2f575842003d298e9bb191a6b3abd68f741` |
| Package | `free.collection.download.read.ebook.anybooks` |
| Manifest version | **3.19.0**, version code **10003189** |
| Minimum / target Android API | 19 / 28 |
| Native ABI | `armeabi-v7a` only |
| Main activity | `co.anybooks.MainActivity` |
| Signature verification | APK v1 and v2 verification passed |
| Signer certificate SHA-256 | `902f0d59d2203748dd20f21e50ee3fc10018596a57ad56d590d8a804967f7c55` |
| Signer certificate subject | `CN=www.bookhubapp.com, OU=US, O=US, L=Beijing, ST=Beijing, C=CN` |

The file hash matches the one published by [Softonic](https://anybooks.en.softonic.com/android/download), but that listing labels it **3.23.0**. The APK's own manifest says **3.19.0**. Matching the published hash establishes which listed binary was supplied; it is not independent proof of publisher identity or a current malware assessment. Certificate subject fields are self-asserted.

## How the catalogue and files are obtained

The APK includes `assets/index.android.bundle` and its source map. The map contains 266 project source files in addition to dependencies. The paths below are relative to the original project's `dist/` directory; extracted source remains in the ignored local audit directory.

| Evidence | What it establishes |
| --- | --- |
| `common/configure/index.js` | Release default is HTTPS on `api.anybooks.live`. The request builder omits the configured sentinel port `80`, so this means ordinary HTTPS, not HTTPS on port 80. |
| `mobx/Firebase/remote.js` | Firebase Remote Config key `API_G` can store a different API configuration locally. A later launch can therefore use an address other than the bundled default. |
| `services/frontapi/service/SearchService.js` | Search uses `/v4/books/search`; suggestions use `/v4/books/search/completion`. |
| `services/frontapi/service/ProfileService.js` | Book metadata uses `/v4/books/profile/{id}`; resource retrieval uses `/v4/books/download/{id}`. |
| `mobx/Bookrack/book.js` | The resource response supplies a download location and size. The reader downloads the resulting file and keeps a local copy. |
| `services/cloudfront/index.js` | This is a generic URL download wrapper despite its name. Its name alone does **not** establish that every book was hosted on Amazon CloudFront. |
| `services/frontapi/fileUpload/FileUpload.js` | The app has a user-upload flow, including an upload-signature request and submission of book information. This establishes an ingestion path, not the provenance of every catalogue entry. |
| `services/frontapi/lib/request.js` | Requests carry session/device headers and signatures. Client-side knowledge of those fields does not establish an authorized public integration API. |

The configuration also contains a commented historical host, `api.bookhubapp.com`, and a development host, `api-global.pre.anybooks.app`. The historical host resolved during this test, but a basic HTTPS request timed out. It is not the active bundled release default. The development host was not used as a substitute production service.

Firebase, Zendesk, analytics, and update-service references are not evidence of upstream book libraries. No Gutenberg, Open Library, Internet Archive, or Wikisource adapter was identified in the inspected project sources. A server-side ingestion pipeline could still use outside providers; the client alone cannot establish that.

## Books actually bundled in the APK

There are three EPUB files under `assets/books/`. Their package metadata identifies:

| EPUB title metadata | Creator metadata | Publisher metadata |
| --- | --- | --- |
| Rich Dad Poor Dad Classics | Robert T. Kiyosaki | Warner Books |
| Where the Crawdads Sing | Delia Owens | Penguin Publishing Group |
| Matchmaking for Beginners | Maddie Dawson | Amazon Publishing |

The inspected OPF metadata contains no `dc:source` or `dc:rights` value. Calibre references and a Penguin Random House link appear inside these EPUBs; neither proves where AnyBooks acquired them. Publisher names are not evidence of an integration agreement. The books were not copied into MLibrary or published as audit artifacts.

## Emulator observations

The unmodified APK installed on a fresh Android 11 Google APIs x86 image with ARMv7 translation enabled. Starting `co.anybooks.MainActivity` resulted in a native `SIGSEGV` on the `create_react_co` thread. The crash stack points into `/system/lib/libndk_translation.so`, and the screen returned to Android's launcher. No catalogue UI or successful catalogue requests were observed in that attempt.

This is a compatibility failure in the tested emulator configuration, not proof that the APK would crash on an ARM phone. [Android's documentation](https://android-developers.googleblog.com/2020/03/run-arm-apps-on-android-emulator.html) describes the ARM compatibility layer used by these emulator images.

A second attempt used an official Android 7.1 ARMv7 system image to avoid translation. The installed emulator engine, version 37.1.11.0, rejected that image before boot with `CPU Architecture 'arm' is not supported by the QEMU2 emulator`. This is an emulator limitation; the app did not run in that configuration.

The third attempt used Android 9, API 28 Google APIs x86 revision 12, with ARMv7 translation. The unchanged APK installed and successfully reached its splash screen and onboarding. Selecting **Prefer not to tell** completed the gender prompt without supplying personal details. [Android's release notes](https://developer.android.com/studio/releases/emulator#30-0-0) document ARM support for Android 9 x86 images and compatibility issues affecting some ARMv7 applications on Android 11 images.

| Test on Android 9 | Observed result |
| --- | --- |
| Library | Search field, Hot Genres heading, navigation tabs, and a quote appeared; no online book catalogue loaded. |
| Search for `Pride and Prejudice` | A loading indicator was followed by **Sorry, we don't find any relevant result.** Runtime DNS requests for the API failed. This is not evidence that the title is absent from the historical catalogue. |
| Bookshelf | Showed **Sorry, you don't have any books. Please add from library.** The bundled EPUB files were not exposed as readable shelf items in this fresh session. |
| Profile | Showed sign-in, interface language, preferred genres, help, and upload-book controls. No sign-in or book upload was performed. |
| Interface language | Offered English, Spanish, Portuguese, and Russian. This is the interface list observed in version 3.19.0, not a claim about every book language available historically. |
| Network | Repeated A and AAAA queries for `api.anybooks.live` received DNS response code 2 (`SERVFAIL`). Firebase Remote Config and Zendesk hostnames resolved; the legacy CodePush hostname returned `NXDOMAIN`. DNS success alone does not establish successful HTTPS or configuration retrieval. |
| Normal restart | The Library remained without books. The new runtime hostname `api.anybooks.mobi` received DNS response code 3 (`NXDOMAIN`) for A and AAAA queries. No host override was manually applied. |

No book download URL or CDN host was returned. Reader controls and page turning could not be exercised through the empty shelf and unavailable catalogue.

## Evidence retained locally

- `artifacts/anybooks-audit/apk-manifest-summary.txt` and `apk-signature.txt`: manifest and signer output.
- `artifacts/anybooks-audit/connectivity.json` and `public-dns.json`: timestamped connection/DNS observations.
- `artifacts/anybooks-audit/alternate-api-dns.json`: independent DNS confirmation for the alternate runtime API hostname.
- `artifacts/anybooks-audit/bundled-books.json` and `epub-referenced-domains.json`: EPUB metadata and referenced domains, without the book contents.
- `.cache/anybooks-audit/source/`: local source-map extraction; not committed or redistributed.
- `.cache/anybooks-audit/crash-log.txt`: first emulator crash trace.
- `artifacts/anybooks-audit/android9-after-onboarding.png`, `android9-search-timeout.png`, `android9-bookshelf.png`, and `android9-languages.png`: successful Android 9 UI inspection.
- `artifacts/anybooks-audit/dns-observations.json`: DNS queries and response codes from the Android 9 packet capture.
- Emulator screenshots and network captures are kept under the ignored `artifacts/anybooks-audit/` directory.

No account credentials were supplied. No login, purchase, access-control modification, or reuse of embedded signing material was performed. MLibrary's application and backend were not changed during this investigation.
