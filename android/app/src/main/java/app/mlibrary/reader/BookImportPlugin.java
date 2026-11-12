package app.mlibrary.reader;

import android.content.Intent;
import android.content.pm.ProviderInfo;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.InputStream;

@CapacitorPlugin(name = "BookImport")
public class BookImportPlugin extends Plugin {
    @PluginMethod public void openPublisher(PluginCall call) {
        String url = call.getString("url", "");
        if (BookDownloadRules.publisher(url).isEmpty()) { call.reject("Invalid publisher address"); return; }
        Intent intent = new Intent(getContext(), QdlBrowserActivity.class);
        intent.putExtra("url", url).putExtra("language", call.getString("language", "en"));
        getActivity().startActivity(intent); call.resolve();
    }
    @PluginMethod public void openQdl(PluginCall call) {
        String url = call.getString("url", "https://www.qdl.qa/en");
        if (!BookDownloadRules.qdlPage(url)) { call.reject("Invalid QDL address"); return; }
        Intent intent = new Intent(getContext(), QdlBrowserActivity.class);
        intent.putExtra("url", url).putExtra("language", call.getString("language", "en"));
        getActivity().startActivity(intent); call.resolve();
    }
    @PluginMethod public void pending(PluginCall call) {
        IncomingBookStore.IO.execute(() -> {
            try { call.resolve(new JSObject().put("items", IncomingBookStore.list(getContext()))); }
            catch (Exception error) { call.reject("Could not read incoming books"); }
        });
    }
    @PluginMethod public void complete(PluginCall call) {
        IncomingBookStore.IO.execute(() -> {
            try { IncomingBookStore.complete(getContext(), call.getString("id")); call.resolve(); }
            catch (Exception error) { call.reject("Could not clear incoming book"); }
        });
    }
    @Override protected void handleOnResume() { notifyListeners("ready", new JSObject(), true); }
    @Override protected void handleOnNewIntent(Intent intent) {
        String action = intent.getAction();
        if (!Intent.ACTION_VIEW.equals(action) && !Intent.ACTION_SEND.equals(action)) return;
        Uri uri = Intent.ACTION_VIEW.equals(action) ? intent.getData() : intent.getParcelableExtra(Intent.EXTRA_STREAM);
        // Consume the intent once; activity recreation must not import it twice.
        getActivity().setIntent(new Intent(Intent.ACTION_MAIN));
        if (uri == null || !"content".equals(uri.getScheme())) { fail("unsupported"); return; }
        ProviderInfo provider = getContext().getPackageManager().resolveContentProvider(uri.getAuthority(), 0);
        // External intents must never turn this receiver into a private-file reader.
        if (provider == null || provider.applicationInfo.uid == android.os.Process.myUid()) { fail("unsupported"); return; }
        IncomingBookStore.IO.execute(() -> {
            try {
                String name = ""; long length = -1;
                try (Cursor cursor = getContext().getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}, null, null, null)) {
                    if (cursor != null && cursor.moveToFirst()) {
                        int n = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME), s = cursor.getColumnIndex(OpenableColumns.SIZE);
                        if (n >= 0) name = cursor.getString(n);
                        if (s >= 0 && !cursor.isNull(s)) length = cursor.getLong(s);
                    }
                }
                String mime = getContext().getContentResolver().getType(uri);
                try (InputStream input = getContext().getContentResolver().openInputStream(uri)) {
                    if (input == null) throw new java.io.IOException("unreadable");
                    IncomingBookStore.stage(getContext(), input, name, mime, length, "", "", bytes -> {});
                }
                notifyListeners("ready", new JSObject(), true);
            } catch (Exception error) { fail(error.getMessage()); }
        });
    }
    private void fail(String code) {
        notifyListeners("importError", new JSObject().put("code", code == null ? "unreadable" : code), true);
    }
}
