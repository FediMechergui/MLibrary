# Public-source integrations in 1.1.0

This update repairs supported integrations; it does not remove provider access controls. Gallica, Hindawi/Safahat, and Qatar Digital Library still return HTTP 403 verification pages from the tested environment. Archive borrowing-only files and authenticated Standard Ebooks feeds remain restricted. Individual public Standard Ebooks imports continue to work.

## What now works

- **DOAB search:** 38,614 book records from its official CC0 CSV export, imported 10 November 2026. Language counts are 31,811 English, 6,896 French, and 32 Arabic; multilingual records overlap. Chapters are excluded. These counts are not unique across other libraries and do not promise a downloadable file for every record.
- **OAPEN search:** OAPEN editions linked by that DOAB snapshot, with repository identities deduplicated. This is a subset of OAPEN, not its entire catalogue.
- **Reading:** supported DOAB and OAPEN book links resolve through their public OAI metadata. The app downloads a compatible file, saves it, and opens its own text/EPUB/PDF reader. Auto mode prefers OAPEN's extracted text; PDF preserves original pages. Source license and attribution remain attached.
- **Publisher scope:** automatic files are currently supported on `library.oapen.org` and the verified Ledizioni upload paths. Other DOAB publisher sites need their own tested adapters; they remain explicit unavailable editions with fallback/import options.
- **Updates:** the Netlify `openaccess-sync` job attempts one official metadata export daily at 03:43 UTC. A complete validated snapshot replaces the previous one in Blobs; errors retain the previous index. `npm run catalog:openaccess` refreshes the bundled snapshot manually.

## Evidence and limits

OAPEN's REST endpoint denies access. Its documented public OAI service returned metadata for `20.500.12657/25287`, *The deliverance of open access books*, including its CC BY-NC license and original PDF/text links. The text returned 485,572 characters. Its original PDF returned actual PDF bytes with total size 9,593,943; subsequent requested chunks were served from the completed in-memory copy.

OAPEN does not supply byte ranges for the tested PDF. The adapter accepts a bounded whole file up to 32 MiB, verifies its length and signature, and keeps at most 64 MiB in a short-lived cache. Cached bytes are then delivered in 1 MiB chunks. Larger non-range files require local import or a smaller text edition. Serverless instances have separate caches; cold starts may download a file again. This is not a shared archival store.

DOAB `20.500.12854/62823`, *A World of Nourishment*, links to a Ledizioni PDF. Its HTTPS URL returned HTTP 206, a PDF signature, and total size 9,433,209. DOAB metadata identifies the edition as open access and retains its CC BY-NC-SA license.

The repository also returned HTTP 429 during consecutive OAPEN probes, with a notice describing temporary throttling and a 1,000-request daily limit. The adapter spaces OAPEN starts by five seconds, caches metadata and complete downloads, respects a cooldown after 429, and propagates the rate-limit response to the client without automatic retry. Pacing is per function instance; deployment-wide admission control or a provider agreement is needed before high-traffic use. A 403/429 is never treated as a readable file or solved using rotating identities.

Inputs are limited to official handle links. Book files come from live repository metadata, an explicit open-license/access statement, and a narrow host/path allowlist. Redirects are checked at every hop and must stay on the same approved host. Wrong identifiers, deleted records, oversized responses, malformed ranges, incomplete files, and HTML returned instead of book bytes fail visibly.

## Release validation

The [final CI run](https://github.com/FediMechergui/MLibrary/actions/runs/42800939850) passed 36 backend and 25 browser tests. The Android APK is version 1.1.0, version code 5, and installed successfully over 1.0.0 using the same development signing key. On Android API 35, both real sample books downloaded from the production API, saved completely, reopened after an offline app reload, and turned pages. The DOAB PDF's third leaf showed printed content; its second leaf is intentionally blank. Arabic RTL also passed. Repeat the native flow with `node scripts/android-smoke.mjs --reset --openaccess-only` on a disposable emulator with its WebView forwarded to port 9223.

The production web/backend deployment is `6af2f55dd104f42f979f4021`. The daily open-access refresh is configured; this validation does not assert that its first scheduled execution has occurred.

## Provider references

- [DOAB metadata and public exports](https://doabooks.org/en/librarians/doab-metadata)
- [OAPEN public OAI record](https://library.oapen.org/oai/request?verb=GetRecord&metadataPrefix=xoai&identifier=oai:library.oapen.org:20.500.12657/25287)
- [DOAB public OAI record](https://directory.doabooks.org/oai/request?verb=GetRecord&metadataPrefix=oai_dc&identifier=oai:directory.doabooks.org:20.500.12854/62823)
- [QDL's documented IIIF access](https://www.qdl.qa/en/image-options): the sample manifest still returned HTTP 403.
- [Gallica's documented document service](https://api.bnf.fr/fr/api-document-de-gallica): the tested metadata/search services still returned HTTP 403.

The original [ten-source audit](SOURCE-AUDIT-1.0.md) is retained as dated evidence; the DOAB/OAPEN findings above supersede those two earlier integration statuses.
