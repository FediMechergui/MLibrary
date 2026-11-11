# Source audit — 11 November 2026

The [62 recorded checks](source-audit-1.5.json) cover all eleven listed providers, representative EN/FR/AR searches, book text, an actual PDF range and individual publisher imports. They do not test every catalogue record. HTTP success for a website is not treated as proof that its book files work.

| Source | Observed result | Available recovery |
| --- | --- | --- |
| Gutenberg | English/French search and full text passed; the Arabic sample had no match. | Use OpenITI or Arabic Wikisource for Arabic coverage. |
| Wikisource | Search and text passed in all three languages; some hits are short entries or chapter indexes. | Follow Contents inside the reader; import a complete EPUB for offline access to an entire multi-page work. |
| Open Library | All searches passed. The French *Madame Bovary* edition opened; sampled English/Arabic records had no public file in the chosen language. | The adapter checks language-matched alternative editions. Search another edition or import a personal copy when none is offered. |
| Internet Archive | EN/FR text and a real 65,536-byte PDF range passed. The first Arabic sample timed out. Restricted items correctly stayed unavailable. | Retry a transient failure, choose another format or another edition. A timeout is not a permanent catalogue removal. |
| Safahat / Hindawi | Catalogue still returned a 403 challenge. The advertised Arabic PDF import passed. | Paste an individual publisher book/PDF link; available files download into the reader. EPUB/catalogue challenges remain external. |
| Gallica | Live website, metadata and IIIF remained 403-challenged. Imported *Germinal* opened successfully. | Search the 710 imported BnF–OBVIL French texts. Other scans require an accessible personal download/import. |
| Standard Ebooks | Anonymous OPDS remained 401. The plain EPUB link returned HTML, but the publisher's advertised download action returned EPUB bytes; app import passed. | Paste an individual book page. The adapter follows the public download action. |
| DOAB | EN/FR/AR searches passed. Sampled French/Arabic records used unsupported publisher files; the sampled English edition's linked repository returned 403. | Use supported OAPEN/ Ledizioni files when available, choose a different edition or import the publisher download. Metadata presence is not a readability promise. |
| OAPEN | EN/FR searches passed; the Arabic sample had no match. Sampled reading requests returned 403 and 429. | Keep rate-limit cooldowns, retry later, choose another supported edition or import the publisher's file. No retries around authorization failures. |
| QDL | Catalogue and search still returned 403 verification pages. | Android Browse & import PDF allows the user to complete any verification and choose a download. If refused, use the ordinary browser and Share/Open with MLibrary. |
| OpenITI | Arabic search and full text passed. Additional real samples from three authors also passed. | 7,098 primary Arabic editions; longer works have reader sections and complete offline downloads. Files above 50 MiB require a smaller volume. |

All 710 included Gallica files are separately checked by the backend regression test for hash integrity, readable text, size, ARK identity and attribution. OpenITI's release metadata is pinned, but only representative live files were fetched during this audit. A source's current rights and availability remain attached to each edition.
