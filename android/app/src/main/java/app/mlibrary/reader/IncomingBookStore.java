package app.mlibrary.reader;

import android.content.Context;
import org.json.JSONObject;
import org.json.JSONArray;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class IncomingBookStore {
    static final ExecutorService IO = Executors.newSingleThreadExecutor();
    private static File directory(Context context) throws IOException {
        File dir = new File(context.getFilesDir(), "incoming-books");
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("storage");
        return dir;
    }
    static synchronized JSONObject stage(Context context, InputStream input, String name, String mime, long length, String sourceUrl, String title, BookDownloadRules.Progress progress) throws Exception {
        File dir = directory(context);
        if (list(context).length() >= 3) throw new IOException("queue");
        String filename = BookDownloadRules.name(name, mime);
        String id = UUID.randomUUID().toString();
        File part = new File(dir, id + ".part"), file = new File(dir, id + ".book"), manifest = new File(dir, id + ".json"), manifestPart = new File(dir, id + ".json.part");
        try {
            long size;
            try (FileOutputStream output = new FileOutputStream(part)) {
                size = BookDownloadRules.copy(input, output, filename, length, progress);
                output.getFD().sync();
            }
            if (!part.renameTo(file)) throw new IOException("storage");
            JSONObject record = new JSONObject().put("id", id).put("name", filename).put("size", size)
                .put("path", android.net.Uri.fromFile(file).toString()).put("sourceUrl", BookDownloadRules.sourcePage(sourceUrl))
                .put("title", title == null ? "" : title.substring(0, Math.min(600, title.length())))
                .put("createdAt", System.currentTimeMillis());
            try (FileOutputStream metadata = new FileOutputStream(manifestPart)) {
                metadata.write(record.toString().getBytes(StandardCharsets.UTF_8)); metadata.getFD().sync();
            }
            if (!manifestPart.renameTo(manifest)) throw new IOException("storage");
            return record;
        } catch (Exception error) {
            part.delete(); file.delete(); manifest.delete(); manifestPart.delete(); throw error;
        }
    }
    static synchronized JSONArray list(Context context) throws Exception {
        File[] files = directory(context).listFiles((dir, name) -> name.endsWith(".json"));
        JSONArray list = new JSONArray();
        if (files == null) return list;
        Arrays.sort(files, Comparator.comparingLong(File::lastModified));
        for (File manifest : files) {
            try {
                JSONObject record = new JSONObject(new String(Files.readAllBytes(manifest.toPath()), StandardCharsets.UTF_8));
                if (new File(directory(context), record.getString("id") + ".book").isFile()) list.put(record);
            } catch (org.json.JSONException invalid) { manifest.delete(); }
        }
        // The class lock excludes active writes. These are leftovers from an interrupted process.
        File[] abandoned = directory(context).listFiles((dir, name) -> name.endsWith(".part") ||
            (name.endsWith(".book") && !new File(dir, name.replace(".book", ".json")).isFile()));
        if (abandoned != null) for (File file : abandoned) file.delete();
        return list;
    }
    static synchronized void complete(Context context, String id) throws Exception {
        if (id == null || !id.matches("[a-f0-9-]{36}")) throw new IOException("invalid");
        File dir = directory(context);
        File file = new File(dir, id + ".book"), manifest = new File(dir, id + ".json");
        if (file.exists() && !file.delete()) throw new IOException("storage");
        if (manifest.exists() && !manifest.delete()) throw new IOException("storage");
    }
}
