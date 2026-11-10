package app.mlibrary.reader;

import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.*;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;

@RunWith(AndroidJUnit4.class)
public class IncomingBookStoreTest {
    private Context context;
    @Before public void setup() {
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        context = new android.content.ContextWrapper(target) {
            @Override public File getFilesDir() {
                File dir = new File(target.getFilesDir(), "import-tests"); dir.mkdirs(); return dir;
            }
        };
    }
    @After public void cleanup() throws Exception {
        org.json.JSONArray files = IncomingBookStore.list(context);
        for (int i = 0; i < files.length(); i++) IncomingBookStore.complete(context, files.getJSONObject(i).getString("id"));
    }
    @Test public void completedFileSurvivesUntilAcknowledgement() throws Exception {
        byte[] data = "%PDF-1.7\nfixture".getBytes(StandardCharsets.UTF_8);
        JSONObject book = IncomingBookStore.stage(context, new ByteArrayInputStream(data), "book.pdf", "application/pdf", data.length, "https://www.qdl.qa/en/archive/book?private=1", "Book", n -> {});
        assertEquals(1, IncomingBookStore.list(context).length());
        assertTrue(book.getString("path").startsWith("file:///"));
        assertEquals("https://www.qdl.qa/en/archive/book", book.getString("sourceUrl"));
        assertArrayEquals(data, java.nio.file.Files.readAllBytes(new File(java.net.URI.create(book.getString("path"))).toPath()));
        IncomingBookStore.complete(context, book.getString("id"));
        assertEquals(0, IncomingBookStore.list(context).length());
    }
    @Test public void failedDownloadDoesNotAppearInQueue() throws Exception {
        try { IncomingBookStore.stage(context, new ByteArrayInputStream("<html>challenge</html>".getBytes(StandardCharsets.UTF_8)), "book.pdf", "application/pdf", -1, "", "", n -> {}); fail("accepted HTML"); }
        catch (IOException expected) { assertEquals("invalid", expected.getMessage()); }
        assertEquals(0, IncomingBookStore.list(context).length());
        assertEquals(0, new File(context.getFilesDir(), "incoming-books").list().length);
    }
    @Test public void cancellingDownloadRemovesPartialFiles() throws Exception {
        try { IncomingBookStore.stage(context, new ByteArrayInputStream(new byte[100]), "book.txt", "text/plain", -1, "", "", n -> { throw new IOException("cancelled"); }); fail("accepted cancelled file"); }
        catch (IOException expected) { assertEquals("cancelled", expected.getMessage()); }
        assertEquals(0, new File(context.getFilesDir(), "incoming-books").list().length);
    }
}
