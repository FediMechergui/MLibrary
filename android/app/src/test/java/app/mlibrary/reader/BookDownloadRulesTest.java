package app.mlibrary.reader;

import org.junit.Test;
import static org.junit.Assert.*;
import java.io.*;
import java.nio.charset.StandardCharsets;

public class BookDownloadRulesTest {
    @Test public void publisherBrowserUsesFixedHostsAndStripsPrivateQueryParameters() {
        assertEquals("annas", BookDownloadRules.publisher("https://annas-archive.gd/search?q=history"));
        assertTrue(BookDownloadRules.publisherDownload("https://files.unglue.it/ebf/abcd.epub", "unglue"));
        assertFalse(BookDownloadRules.publisherDownload("https://www.fadedpage.com/link.php?file=20140519.epub", "annas"));
        for (String url : new String[]{"https://annas-archive.gd.evil.test/book", "https://user:secret@annas-archive.gd/book", "http://annas-archive.gd/book", "https://127.0.0.1/book.epub", "file:///private/book"}) assertEquals("", BookDownloadRules.publisher(url));
        assertEquals("https://annas-archive.gd/md5/abc", BookDownloadRules.sourcePage("https://annas-archive.gd/md5/abc?key=secret"));
        assertEquals("https://www.fadedpage.com/showbook.php?pid=201410E7", BookDownloadRules.sourcePage("https://www.fadedpage.com/showbook.php?pid=201410E7"));
    }
    @Test public void browserAndDownloadsStayOnPublisher() {
        assertTrue(BookDownloadRules.qdlPage("https://www.qdl.qa/en/archive/81055/vdc_100023807156.0x000001"));
        assertTrue(BookDownloadRules.qdlPdf("https://www.qdl.qa/download/pdf/81055_vdc_100023807156.0x000001_en.pdf"));
        for (String url : new String[]{"http://www.qdl.qa/en", "https://www.qdl.qa.evil.test/a", "https://evil.test@www.qdl.qa/en", "https://www.qdl.qa:8443/en", "javascript:alert(1)", "file:///data/private", "intent://qdl.qa", "https://www.qdl.qa\\@evil.test/a"}) assertFalse(url, BookDownloadRules.qdlPage(url));
        for (String url : new String[]{"https://www.qdl.qa/en", "https://www.qdl.qa/download/pdf/81055_../secret_en.pdf", "https://www.qdl.qa/download/pdf/81055_%2e%2e_en.pdf", "https://iiif.qdl.qa/download/pdf/81055_test_en.pdf"}) assertFalse(url, BookDownloadRules.qdlPdf(url));
    }
    @Test public void shortReadsPreserveCompleteSignatureAndBytes() throws Exception {
        byte[] pdf = "%PDF-1.7\nfixture".getBytes(StandardCharsets.UTF_8);
        InputStream input = new ByteArrayInputStream(pdf) { @Override public synchronized int read(byte[] b, int off, int len) { return super.read(b, off, Math.min(2, len)); } };
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        assertEquals(pdf.length, BookDownloadRules.copy(input, output, "book.pdf", pdf.length, bytes -> {}));
        assertArrayEquals(pdf, output.toByteArray());
    }
    private void rejected(String code, byte[] data, String filename, long length) throws Exception {
        try { BookDownloadRules.copy(new ByteArrayInputStream(data), new ByteArrayOutputStream(), filename, length, bytes -> {}); fail("accepted " + code); }
        catch (IOException error) { assertEquals(code, error.getMessage()); }
    }
    @Test public void challengeAndTruncatedResponsesNeverBecomeBooks() throws Exception {
        rejected("invalid", "<html>Just a moment...</html>".getBytes(StandardCharsets.UTF_8), "book.pdf", -1);
        rejected("incomplete", "%PDF-1.7".getBytes(StandardCharsets.UTF_8), "book.pdf", 100);
        rejected("incomplete", new byte[0], "book.pdf", -1);
        rejected("invalid", "PKxx".getBytes(StandardCharsets.UTF_8), "book.epub", -1);
    }
    @Test public void declaredAndStreamedSizeLimitsAreEnforced() throws Exception {
        rejected("size", new byte[0], "book.pdf", BookDownloadRules.MAX_BYTES + 1);
        InputStream endless = new InputStream() {
            @Override public int read() { return 1; }
            @Override public int read(byte[] bytes, int offset, int length) { return length; }
        };
        try { BookDownloadRules.copy(endless, OutputStream.nullOutputStream(), "book.txt", -1, bytes -> {}); fail("accepted oversize stream"); }
        catch (IOException error) { assertEquals("size", error.getMessage()); }
    }
    @Test public void cancellationStopsStream() throws Exception {
        try { BookDownloadRules.copy(new ByteArrayInputStream(new byte[100000]), OutputStream.nullOutputStream(), "book.txt", -1, bytes -> { throw new IOException("cancelled"); }); fail("ignored cancellation"); }
        catch (IOException error) { assertEquals("cancelled", error.getMessage()); }
    }
    @Test public void filenamesCannotEscapeStagingDirectory() throws Exception {
        assertEquals("book.pdf", BookDownloadRules.name("../../book.pdf", "application/pdf"));
        assertEquals("book.epub", BookDownloadRules.name("C:\\folder\\book.epub", "application/epub+zip"));
        assertEquals("Downloaded book.pdf", BookDownloadRules.name(null, "application/pdf"));
        try { BookDownloadRules.name("program.apk", "application/vnd.android.package-archive"); fail("accepted executable"); }
        catch (IOException error) { assertEquals("unsupported", error.getMessage()); }
    }
    @Test public void attributionNeverPersistsSessionParameters() {
        assertEquals("https://www.qdl.qa/en/archive/book", BookDownloadRules.sourcePage("https://qdl.qa/en/archive/book?token=private#fragment"));
        assertEquals("", BookDownloadRules.sourcePage("https://other.test/book"));
    }
}
