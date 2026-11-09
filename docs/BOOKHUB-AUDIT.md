# BookHub 1.1.0 APK investigation

Inspected 9 November 2026. This report concerns the user-supplied `com.freenovel.anybooks.bookhub-1.1.0.apk` and compares it with the [previous AnyBooks APK](ANYBOOKS-AUDIT.md).

## Result

BookHub successfully opened on Android 9 after the user authorized accepting its startup Terms of Use prompt. Its Library, search, Bookshelf, profile, and language menus were inspected. The Library remained without loaded book records, search for `Pride and Prejudice` eventually displayed a no-results message, and the Bookshelf was empty.

The app's bundled production API is **`https://api.bookhubapp.com`**. Runtime DNS traffic confirms that it contacted this hostname. DNS resolution succeeded, but ordinary HTTPS requests to the API and publisher website timed out from this environment. No working catalogue response, book file URL, or upstream supplier list was obtained. These observations do not establish permanent or worldwide service unavailability.

## Verified identity

| Property | Observed value |
| --- | --- |
| Application label | BookHub |
| Package | `com.freenovel.anybooks.bookhub` |
| Version | **1.1.0**, version code **1048635** |
| File size | 15,148,178 bytes |
| SHA-256 | `d727d56475213902bdc415171900264447df6b87d93d07cb097b4da7f5569d96` |
| Minimum / target Android API | 19 / 28 |
| Native ABI | `armeabi-v7a` only |
| Main activity | `co.anybooks.MainActivity` |
| Signature verification | APK v1 and v2 verification passed |
| Signer certificate SHA-256 | `902f0d59d2203748dd20f21e50ee3fc10018596a57ad56d590d8a804967f7c55` |

The signer certificate is **identical** to the one in the previously supplied AnyBooks 3.19.0 APK. Both also use the same main-activity name and a React Native client with Realm and FBReader components. This supports a shared application lineage and signing identity; the certificate alone does not independently verify a publisher's legal identity or establish book redistribution rights.

## Catalogue and download implementation

The APK contains a 2,567,878-byte `assets/index.android.bundle` with 1,238 Metro modules. Unlike the first APK, it contains no accompanying JavaScript source map. Module numbers below identify code in this exact bundle. Extracted code remains local and ignored by Git.

| Evidence | Verified behavior |
| --- | --- |
| Module 713 | Production API configuration uses HTTPS and `api.bookhubapp.com`; development configuration references `pre.bookhubapp.com`. The development service was not used for this investigation. |
| Module 704 | Builds requests from the configured host and the supplied route, with no added `/v4` prefix. The sentinel port `80` is omitted, so the production URL uses ordinary HTTPS on port 443. Requests include session/device headers. |
| Module 1149 | Searches `GET /books/search` with `content`, `limit`, and `offset`. Also defines `/books/search/suggest`, `/books/search/other`, and `/books/search/completion`. |
| Module 793 | Retrieves book details from `GET /books/{id}/profile`. |
| Module 779 | Book records carry a resource URL. A metadata refresh reads `resource.url`; the download routine uses that URL and checks the downloaded file's hash. |
| Module 784 | A generic downloader named `cloudFrontResourceRequest` performs a GET on the supplied URL and saves an EPUB locally. The name does not establish a particular CDN host. |
| Module 796 | Exposes native FBReader controls, including font size, colour profile, and table-of-contents navigation. These code paths were inspected but not exercised with a book. |

No separate `/v4/books/download/{id}` request was identified in this build's inspected download flow. That is a material difference from AnyBooks 3.19.0, where a separate API request supplies the download location.

The Library's upload icon opens **Share your stories** instructions. They direct contributors to `https://bookhubapp.com/create` on a PC, sign in with Facebook, and upload their own content through a form. This is evidence of an advertised user-contribution route, not proof of the provenance of every book. The portal was not used to sign in or upload content.

No Gutenberg, Open Library, Internet Archive, Wikisource, or LibGen adapter was identified in the application bundle. A Gutenberg URL does appear in the bundled FBReader language resources, but specifically as a **custom-catalogue example**, not an active BookHub source. `books.fbreader.org/help.html` is a synchronization-help link in those resources. Neither establishes the origin of BookHub's catalogue.

No entries with EPUB/PDF/MOBI/AZW/FB2 extensions, `assets/books/` entries, or nested ZIP archives were identified. This APK does not include the three EPUBs found in the first APK. It therefore did not provide an offline catalogue or sample book for reader testing.

## Runtime and network observations

The unmodified APK was installed in the existing isolated Android 9 audit emulator. The first AnyBooks package was force-stopped before testing BookHub. No personal account sign-in, upload, book-request submission, or payment was performed.

| Check | Observed result |
| --- | --- |
| Startup | Reached the Terms of Use prompt; selected ALLOW only after the user's explicit approval. The Library then opened. |
| Library | Displayed Hot Genres, Hot, Trending, and New Upload sections, but their book content did not load. |
| Search | `Pride and Prejudice` progressed from loading to **Sorry, we don't find any relevant result.** This is not reliable evidence that the title is absent from the historical catalogue. |
| Bookshelf | Displayed an empty shelf and directed the user to add books from the Library. |
| Catalogue language menu | English, Hindi, and Tamil. |
| Interface language menu | English, Hindi, and Tamil. Arabic and French were not offered in either observed menu. |
| Upload icon | Opened instructions for the publisher's web submission portal, rather than a local book importer. No submission was made. |
| Reader | No book was available through the tested flow. The manifest has no standard Android VIEW/EPUB intent filter for opening a local test EPUB, so page turning and reading modes remain untested. |
| API DNS | Emulator A and AAAA queries for `api.bookhubapp.com` succeeded. Local lookup and Google's public resolver also returned addresses. |
| API and website HTTPS | Requests to `api.bookhubapp.com`, `bookhubapp.com`, and `www.bookhubapp.com` timed out after 15 seconds. An additional API request using a public-resolver address with the original hostname also timed out with zero response bytes. |
| App updates | The observed legacy CodePush hostname returned `NXDOMAIN`. No alternate catalogue hostname was observed during this test. |

The client still depends on its publisher's API to obtain the actual book records and resource URLs. Recovering a client-side endpoint does not recover the server's catalogue or disclose its ingestion pipeline. No working source was added to MLibrary as a result of this investigation.

## Comparison with the first APK

| Aspect | AnyBooks 3.19.0 | BookHub 1.1.0 |
| --- | --- | --- |
| Signing certificate | Same certificate | Same certificate |
| Package | `free.collection.download.read.ebook.anybooks` | `com.freenovel.anybooks.bookhub` |
| Observed API hosts | `api.anybooks.live`, then `api.anybooks.mobi` | `api.bookhubapp.com` |
| Connectivity result | API DNS failures | DNS succeeds; HTTPS requests time out |
| Download flow in code | Separate download-location request | Resource URL in book metadata |
| Bundled book files | Three EPUBs | None identified |
| Catalogue access obtained | No | No |

## Local evidence

- `artifacts/bookhub-audit/apk-manifest-summary.txt`, `apk-signature.txt`, and `apk-entries.json`: file identity and package inventory.
- `artifacts/bookhub-audit/bundle-service-map.json`: inspected module IDs, route fragments, and hostnames.
- `artifacts/bookhub-audit/connectivity.json`, `alternate-public-dns-https.txt`, and `dns-observations.json`: network observations.
- `artifacts/bookhub-audit/after-agreement.png`, `search-result.png`, `bookshelf.png`, `catalogue-languages.png`, `interface-languages.png`, and `upload-entry.png`: tested screens.
- `.cache/bookhub-audit/`: original APK copy, local bundle analysis, emulator logs, and test helpers.

APK contents, extracted code, and raw captures remain in ignored local directories. This inspection did not change MLibrary's application or backend.
