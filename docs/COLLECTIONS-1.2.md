# Safahat, Gallica and QDL investigation — 10 November 2026

## Safahat / Hindawi

The ordinary book page for [الشهاب الراصد](https://www.safahat.org/books/86869064/) advertises separate EPUB and PDF files on Hindawi's download server. The EPUB request returned a verification page. The [advertised public PDF](https://downloads.hindawi.org/books/86869064.pdf) returned HTTP 200, 3,553,001 bytes, a PDF signature, Arabic title/author metadata, and 366 pages. The implemented adapter uses that public PDF service.

In Sources → Hindawi / Safahat, paste a book page or its official PDF URL. A complete PDF up to 32 MiB is downloaded, parsed without allowing encryption, then delivered to the app in bounded chunks. The app saves and opens its own PDF reader. Original copyright and permission pages remain untouched. Public distribution by the publisher does not make every title public domain. Live catalogue search and EPUB import from this provider remain unavailable.

The server caches at most 64 MiB for 30 minutes per instance, coalesces simultaneous downloads of the same book, spaces requests, and stops on access denial or throttling. Cold instances may download another copy. Larger files need a normal device download and local import. This is an individual-book adapter, not a bulk publisher mirror.

## Gallica

The live document, text and IIIF routes still return HTTP 403. BnF separately publishes a [French BnF–OBVIL TEI collection](https://api.bnf.fr/fr/documents-de-gallica-produits-au-format-tei-par-obvil) through its public bulk-download service. Its `alphabet/x.tar` and `alphabet/z.tar` archives were downloaded using the ordinary public interface, without authentication or challenge solving.

MLibrary imports **232 French documents** from those two archives, including *Germinal* (`bpt6k5493777b`). They are searchable under Gallica, open as text inside the reader, and save offline. This is a small subset of the published corpus, and includes historical texts of different lengths. It does not connect every Gallica scan or provide Arabic/English Gallica coverage.

The import validates XML and book identities, retains source ARKs and BnF–OBVIL attribution, and excludes **23 malformed XML documents**. See [archive hashes and exclusions](gallica-import-1.2.json). Text comes from OCR and can contain transcription errors. [Gallica reuse conditions](https://gallica.bnf.fr/accueil/fr/html/conditions-dutilisation-de-gallica) remain attached, including the need for the relevant permission for commercial reuse.

To expand this collection, download another `.tar` and matching `.json` through BnF's dataset page, then run `python scripts/seed-gallica.py <all-archives-to-include>`. The script reads individual archive members without extracting paths and atomically replaces the snapshot. Include the existing archives to retain them. This snapshot is manually refreshed; it is not part of the daily DOAB/OAPEN job. Larger collections should move from bundled function assets to indexed object storage before importing the full corpus.

## Qatar Digital Library

No complete QDL book download is connected. The website/search, documented [IIIF manifest and image services](https://www.qdl.qa/en/image-options), and the PDF offered by [this public archive record](https://www.qdl.qa/en/archive/81055/vdc_100023807156.0x000001) all returned HTTP 403 verification pages from the tested environment. A 403 response was not imported as a book.

The British Library publishes a related [Arabic OCR training dataset](https://bl.iro.bl.uk/entities/product/3bf57823-04bb-43e1-be2a-0114fc380d34), but it contains selected manuscript pages rather than complete QDL books. It is not a substitute for a working catalogue or complete-book adapter.

The remaining direct-integration route is provider-approved machine access or a supported bulk export. The following request is prepared for the operator to send through [QDL contact](https://www.qdl.qa/en/contact-us); it has **not been sent**:

> We operate MLibrary, a free multilingual reading app at https://mlibrary-fedimechergui.netlify.app. We would like to integrate permitted QDL records and public full-book downloads with original attribution. Ordinary requests to the documented IIIF APIs and advertised PDFs currently receive HTTP 403 verification pages. Do you offer a machine-access endpoint, bulk export, registration, or allowlisting process? Please specify permitted reuse, caching/offline-download terms, quotas, and the appropriate identification/contact requirements. We will implement those limits and will not circumvent verification or authenticated access.

Until that access is available, QDL editions can be read through local PDF import after obtaining a copy normally, or readers can search another library. The app continues to mark QDL as blocked rather than claiming it works.
