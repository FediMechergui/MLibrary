package app.mlibrary.reader;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.util.Locale;

/** Rules shared by the native browser and incoming-document receiver. */
public final class BookDownloadRules {
    public static final long MAX_BYTES = 50L * 1024 * 1024;
    public static String publisher(String value) {
        try {
            URI uri = new URI(value);
            if (value.length() > 4096 || !"https".equals(uri.getScheme()) || uri.getUserInfo() != null || uri.getPort() != -1 || uri.getHost() == null) return "";
            String host = uri.getHost();
            if (host.equals("qdl.qa") || host.equals("www.qdl.qa")) return "qdl";
            if (host.equals("unglue.it") || host.equals("files.unglue.it")) return "unglue";
            if (host.equals("www.fadedpage.com")) return "fadedpage";
            if (host.equals("www.globalgreyebooks.com")) return "globalgrey";
            for (String domain : new String[]{"annas-archive.gd", "annas-archive.gl", "annas-archive.pk"})
                if (host.equals(domain) || host.endsWith("." + domain)) return "annas";
            return "";
        } catch (Exception error) { return ""; }
    }
    public static boolean publisherPage(String value, String source) {
        return source != null && !source.isEmpty() && source.equals(publisher(value));
    }
    public static boolean publisherDownload(String value, String source) {
        if ("qdl".equals(source)) return qdlPdf(value);
        if (publisherPage(value, source)) return true;
        // Public Anna download domains listed by the provider's availability monitor.
        // Unknown mirrors stay external; monitor responses never expand this allowlist.
        if ("annas".equals(source)) try {
            URI uri = new URI(value);
            return value.length() <= 4096 && "https".equals(uri.getScheme()) && uri.getUserInfo() == null && uri.getPort() == -1
                && ("yqrii5.org".equals(uri.getHost()) || "wbsg8v.xyz".equals(uri.getHost()));
        } catch (Exception ignored) { }
        return false;
    }
    public static boolean qdlPage(String value) {
        try {
            URI uri = new URI(value);
            return value.length() <= 4096 && "https".equals(uri.getScheme())
                && ("www.qdl.qa".equals(uri.getHost()) || "qdl.qa".equals(uri.getHost()))
                && uri.getUserInfo() == null && uri.getPort() == -1;
        } catch (Exception error) { return false; }
    }
    public static boolean qdlPdf(String value) {
        if (!qdlPage(value)) return false;
        URI uri = URI.create(value);
        return uri.getRawPath().matches("/download/pdf/81055_[A-Za-z0-9_.-]+_(en|ar)\\.pdf")
            && !uri.getRawPath().contains("..");
    }
    public static String sourcePage(String value) {
        if (publisher(value).isEmpty()) return "";
        URI uri = URI.create(value);
        if (qdlPage(value)) return "https://www.qdl.qa" + uri.getRawPath();
        // Preserve the public Faded Page identifier, never account/download query tokens.
        String query = "fadedpage".equals(publisher(value)) && uri.getRawQuery() != null && uri.getRawQuery().matches("pid=[0-9A-Z]{8}") ? "?" + uri.getRawQuery() : "";
        return "https://" + uri.getHost() + uri.getRawPath() + query;
    }
    public static String name(String value, String mime) throws IOException {
        String clean = (value == null ? "" : value).replace('\\', '/');
        clean = clean.substring(clean.lastIndexOf('/') + 1).replaceAll("[\\p{Cntrl}]", " ").trim();
        if (clean.length() > 180) clean = clean.substring(clean.length() - 180);
        if (!clean.toLowerCase(Locale.ROOT).matches(".+\\.(pdf|epub|txt)")) {
            String ext = "application/pdf".equals(mime) ? "pdf" : "application/epub+zip".equals(mime) ? "epub" : "text/plain".equals(mime) ? "txt" : null;
            if (ext == null) throw new IOException("unsupported");
            clean = (clean.isEmpty() ? "Downloaded book" : clean) + "." + ext;
        }
        return clean;
    }
    public interface Progress { void update(long bytes) throws IOException; }
    public static long copy(InputStream input, OutputStream output, String filename, long expected, Progress progress) throws IOException {
        if (expected > MAX_BYTES) throw new IOException("size");
        byte[] buffer = new byte[32768], signature = new byte[5];
        int signatureSize = 0, count; long total = 0;
        while ((count = input.read(buffer)) != -1) {
            total += count;
            if (total > MAX_BYTES) throw new IOException("size");
            for (int i = 0; i < count && signatureSize < 5; i++) signature[signatureSize++] = buffer[i];
            output.write(buffer, 0, count);
            progress.update(total);
        }
        if (total == 0 || (expected >= 0 && total != expected)) throw new IOException("incomplete");
        String lower = filename.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".pdf") && !(signatureSize == 5 && signature[0] == '%' && signature[1] == 'P' && signature[2] == 'D' && signature[3] == 'F' && signature[4] == '-')) throw new IOException("invalid");
        if (lower.endsWith(".epub") && !(signatureSize >= 4 && signature[0] == 'P' && signature[1] == 'K' && signature[2] == 3 && signature[3] == 4)) throw new IOException("invalid");
        return total;
    }
    private BookDownloadRules() {}
}
