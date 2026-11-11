# MLibrary 1.5.0

This release adds portable library recovery, optional encrypted device sync, broader Arabic/French reading coverage and a reproducible Android store build.

- My Library → Backup & device sync exports ZIP backups with optional offline EPUB/PDF/text files. Restore previews the library, validates archive paths, sizes and content hashes, then merges. Existing progress JSON exports also import.
- Device sync is opt-in, uses a private recovery key and encrypts shelves, notes, progress and quote designs before upload. The server receives an authentication token and encrypted bytes, not the decryption key. Conflict retries, deletion timestamps and per-device reading counters preserve independent work. Storage is limited to 2 MiB per vault. Files move through backups; cloud deletion and disconnect are explicit controls.
- OpenITI adds 7,098 primary Arabic editions, pinned to official release commit `cfc4157a3cf2054c0888f133970a4eaa3e22e58c`. Full text was sampled for Abu Talib, al-Ghazali and an Ibn Khaldun-related work. Long works use reader sections and complete offline downloads. The source's CC BY-NC-SA 4.0 attribution stays attached.
- Gallica grows from 232 to 710 French texts through five official BnF–OBVIL archives. Eighty-eight malformed XML records were excluded. Every included text has a validated ARK, attribution and file hash. The text files are served individually; search and Android installation do not load the entire corpus.
- Netlify reads the private repository using a read-only deploy key. Checks trigger a site-specific deployment hook; GitHub holds no broad Netlify token. OpenITI metadata refresh is scheduled weekly; existing Gutenberg and DOAB/OAPEN schedules remain.
- Gradle is pinned to 8.14.3 with its official distribution checksum. Android version code is 9. A permanent RSA-4096 upload key signs the separate store AAB and release APK; the usual GitHub APK retains the existing development certificate for update compatibility.

Play submission is not performed: the owner has no Play Console account yet. The listing draft, public privacy information, branding assets and signed bundle are prepared for that step. Developer/support contact details and Console declarations remain owner requirements.

Safahat catalogue/EPUB challenges and automated QDL access remain provider-controlled. Their existing PDF and browser-assisted import paths remain available. The 710 Gallica texts are an imported subset, not every Gallica scan. Metadata coverage across all providers does not guarantee a readable file for every edition.

## Source provenance

- [OpenITI release](https://github.com/OpenITI/RELEASE) and [license/documentation](https://github.com/OpenITI/documentation/blob/master/index.md).
- [Official BnF–OBVIL corpus](https://api.bnf.fr/fr/documents-de-gallica-produits-au-format-tei-par-obvil). Archives: i, u, x, y, z. Machine-readable hashes/exclusions are in `server/data/gallica.json.gz`.
- [Store preparation](STORE-READINESS.md) records the signing migration and publication requirements.
