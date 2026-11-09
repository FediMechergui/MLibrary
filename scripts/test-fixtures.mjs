import JSZip from "jszip";
import { mkdir, writeFile } from "node:fs/promises";
await mkdir("tests/fixtures", { recursive: true });
const zip = new JSZip();
zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
zip.file(
  "META-INF/container.xml",
  '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
);
zip.file(
  "OEBPS/content.opf",
  '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">mlibrary-test</dc:identifier><dc:title>The Open Library</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">2026-11-09T00:00:00Z</meta></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine><itemref idref="chapter"/></spine></package>',
);
zip.file(
  "OEBPS/nav.xhtml",
  '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">The open library</a></li></ol></nav></body></html>',
);
zip.file(
  "OEBPS/chapter.xhtml",
  '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>The open library</title></head><body><h1>The open library</h1><p>Books make room for new perspectives. This is an original test fixture for MLibrary.</p><script>window.parent.__epub_script_ran=true;</script></body></html>',
);
await writeFile(
  "tests/fixtures/reader.epub",
  await zip.generateAsync({ type: "nodebuffer" }),
);
const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
];
const stream = "BT /F1 24 Tf 50 760 Td (MLibrary PDF reading test) Tj ET";
objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
let pdf = "%PDF-1.4\n";
const offsets = [0];
objects.forEach((object, i) => {
  offsets.push(Buffer.byteLength(pdf));
  pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
});
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
  .slice(1)
  .map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)
  .join(
    "",
  )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
await writeFile("tests/fixtures/reader.pdf", pdf);
console.log("EPUB and PDF fixtures written.");
