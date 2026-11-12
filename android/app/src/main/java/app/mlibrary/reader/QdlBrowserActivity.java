package app.mlibrary.reader;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.graphics.Color;
import android.view.View;
import android.webkit.*;
import android.widget.*;
import androidx.appcompat.app.AppCompatActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

/** A normal publisher browser. No JS bridge, injected scripts or challenge automation. */
public class QdlBrowserActivity extends AppCompatActivity {
    private WebView browser;
    private TextView status;
    private Button cancel;
    private ProgressBar progress;
    private String language, pageUrl, publisher, pageTitle = "";
    private boolean busy;
    private final AtomicBoolean cancelled = new AtomicBoolean();
    private final ExecutorService downloads = Executors.newSingleThreadExecutor();
    private volatile HttpURLConnection connection;

    private String text(String en, String fr, String ar) { return "ar".equals(language) ? ar : "fr".equals(language) ? fr : en; }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private Button button(String label) {
        Button button = new Button(this); button.setText(label); button.setTextSize(12); button.setMinHeight(dp(48)); return button;
    }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        language = getIntent().getStringExtra("language");
        pageUrl = getIntent().getStringExtra("url");
        publisher = BookDownloadRules.publisher(pageUrl);
        if (publisher.isEmpty()) { finish(); return; }
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(Color.rgb(248, 245, 242));
        root.setLayoutDirection("ar".equals(language) ? View.LAYOUT_DIRECTION_RTL : View.LAYOUT_DIRECTION_LTR);
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            androidx.core.graphics.Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom); return insets;
        });
        LinearLayout toolbar = new LinearLayout(this);
        Button close = button(text("Close", "Fermer", "إغلاق")); close.setOnClickListener(view -> finish());
        Button back = button(text("Back", "Retour", "رجوع")); back.setOnClickListener(view -> goBack());
        Button external = button(text("Open browser", "Navigateur", "المتصفح")); external.setOnClickListener(view -> {
            String url = BookDownloadRules.publisherPage(browser.getUrl(), publisher) ? browser.getUrl() : pageUrl;
            try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE)); }
            catch (Exception error) { status.setText(text("No browser installed.", "Aucun navigateur installé.", "لا يوجد متصفح مثبت.")); }
        });
        toolbar.addView(close, new LinearLayout.LayoutParams(0, dp(52), 1));
        toolbar.addView(back, new LinearLayout.LayoutParams(0, dp(52), 1));
        toolbar.addView(external, new LinearLayout.LayoutParams(0, dp(52), 1.5f)); root.addView(toolbar);
        status = new TextView(this); status.setTextColor(Color.rgb(51, 43, 48)); status.setTextSize(13); status.setPadding(dp(14), dp(8), dp(14), dp(8));
        status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        status.setText(text("Choose a book and download its EPUB or PDF to read in MLibrary. Complete any verification yourself. If needed, use Open browser, then Open with / Share to MLibrary.", "Téléchargez l’EPUB ou le PDF d’un livre pour le lire dans MLibrary. Effectuez la vérification si nécessaire. Sinon, utilisez Navigateur, puis Ouvrir avec / Partager vers MLibrary.", "نزّل ملف EPUB أو PDF للقراءة في MLibrary. أكمل التحقق بنفسك عند الحاجة. يمكنك استخدام المتصفح ثم فتح باستخدام أو مشاركة إلى MLibrary.")); root.addView(status);
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal); progress.setVisibility(View.GONE); root.addView(progress);
        cancel = button(text("Cancel download", "Annuler le téléchargement", "إلغاء التنزيل")); cancel.setVisibility(View.GONE); cancel.setOnClickListener(view -> cancelDownload()); root.addView(cancel);
        browser = new WebView(this);
        WebSettings settings = browser.getSettings(); settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false); settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true); settings.setSupportZoom(true); settings.setBuiltInZoomControls(true); settings.setDisplayZoomControls(false);
        CookieManager.getInstance().setAcceptThirdPartyCookies(browser, false);
        browser.setWebChromeClient(new WebChromeClient());
        browser.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                String url = request.getUrl().toString();
                if (BookDownloadRules.qdlPdf(url)) { download(url); return true; }
                return !BookDownloadRules.publisherDownload(url, publisher);
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (BookDownloadRules.publisherPage(url, publisher) && !BookDownloadRules.qdlPdf(url)) { pageUrl = url; pageTitle = view.getTitle(); }
            }
        });
        browser.setDownloadListener((url, userAgent, disposition, mime, length) -> download(url));
        root.addView(browser, new LinearLayout.LayoutParams(-1, 0, 1)); setContentView(root);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) { @Override public void handleOnBackPressed() { goBack(); } });
        if (state == null || browser.restoreState(state) == null) browser.loadUrl(pageUrl);
    }
    private void goBack() { if (browser.canGoBack()) browser.goBack(); else finish(); }
    private void cancelDownload() { cancelled.set(true); HttpURLConnection active = connection; if (active != null) active.disconnect(); }
    private void download(String url) {
        if (busy) return;
        if (!BookDownloadRules.publisherDownload(url, publisher)) { status.setText(text("This download host is not supported. Use Open browser, then Share to MLibrary.", "Utilisez Navigateur, puis Partager vers MLibrary pour ce téléchargement.", "هذا التنزيل ليس ملف PDF مدعومًا من المكتبة.")); return; }
        busy = true; cancelled.set(false); cancel.setVisibility(View.VISIBLE); progress.setVisibility(View.VISIBLE); progress.setIndeterminate(true);
        status.setText(text("Downloading book… Keep this screen open.", "Téléchargement du livre… Gardez cet écran ouvert.", "جارٍ تنزيل PDF… أبقِ هذه الشاشة مفتوحة."));
        String source = pageUrl, title = pageTitle, agent = browser.getSettings().getUserAgentString();
        // Use this device's current browser session only for the publisher's own download.
        // Neither session cookies nor this request ever go to the catalogue backend.
        downloads.execute(() -> {
            try {
                String next = url;
                for (int hop = 0; hop < 4; hop++) {
                    if (cancelled.get()) throw new IOException("cancelled");
                    if (!BookDownloadRules.publisherDownload(next, publisher)) throw new IOException("redirect");
                    HttpURLConnection request = (HttpURLConnection) new URL(next).openConnection(); connection = request;
                    request.setInstanceFollowRedirects(false); request.setConnectTimeout(20000); request.setReadTimeout(30000);
                    request.setRequestProperty("User-Agent", agent); request.setRequestProperty("Accept", "application/epub+zip, application/pdf, application/octet-stream");
                    if (new URL(next).getHost().equals(new URL(source).getHost())) request.setRequestProperty("Referer", source);
                    request.setRequestProperty("Accept-Encoding", "identity");
                    String cookie = CookieManager.getInstance().getCookie(next);
                    if (cookie != null) request.setRequestProperty("Cookie", cookie);
                    try {
                        int code = request.getResponseCode();
                        if (code == 301 || code == 302 || code == 303 || code == 307 || code == 308) {
                            String location = request.getHeaderField("Location");
                            if (location == null) throw new IOException("redirect");
                            next = new URL(new URL(next), location).toString(); continue;
                        }
                        if (code != 200) throw new IOException("http:" + code);
                        String mime = request.getContentType();
                        if (mime != null && mime.toLowerCase(java.util.Locale.ROOT).contains("text/html")) throw new IOException("verification");
                        long length = request.getContentLengthLong();
                        // A generic application/octet-stream must not make Android
                        // rename a publisher's .epub attachment to .bin.
                        String name = URLUtil.guessFileName(next, request.getHeaderField("Content-Disposition"), null);
                        if ("qdl".equals(publisher)) name = Uri.parse(next).getLastPathSegment();
                        final String bookMime = mime == null ? "application/octet-stream" : mime.split(";")[0].trim();
                        try (InputStream input = request.getInputStream()) {
                            final long[] lastUpdate = {0};
                            IncomingBookStore.stage(getApplicationContext(), input, name, bookMime, length, source, title, bytes -> {
                                if (cancelled.get()) throw new IOException("cancelled");
                                long now = System.currentTimeMillis();
                                if (now - lastUpdate[0] > 300) { lastUpdate[0] = now; runOnUiThread(() -> {
                                    if (length > 0) { progress.setIndeterminate(false); progress.setProgress((int) (bytes * 100 / length)); }
                                }); }
                            });
                        }
                        runOnUiThread(() -> {
                            if (isFinishing() || isDestroyed()) return;
                            startActivity(new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)); finish();
                        });
                        return;
                    } finally { request.disconnect(); connection = null; }
                }
                throw new IOException("redirect");
            } catch (Exception error) {
                runOnUiThread(() -> {
                    if (isFinishing() || isDestroyed()) return;
                    busy = false; cancel.setVisibility(View.GONE); progress.setVisibility(View.GONE);
                    String code = error.getMessage();
                    status.setText(cancelled.get() ? text("Download cancelled.", "Téléchargement annulé.", "تم إلغاء التنزيل.")
                        : "size".equals(code) ? text("This book exceeds the 50 MB import limit.", "Ce livre dépasse la limite de 50 Mo.", "يتجاوز هذا الملف حد الاستيراد البالغ 50 ميغابايت.")
                        : text("The publisher did not provide a complete EPUB or PDF. You can finish verification and retry, or use Open browser. In Chrome, download the PDF and choose Open with / Share to MLibrary.", "La source n’a pas fourni de livre complet. Terminez la vérification et réessayez, ou utilisez Navigateur. Dans Chrome, téléchargez le PDF puis choisissez Ouvrir avec / Partager vers MLibrary.", "لم توفر المكتبة ملف PDF كاملًا. أكمل التحقق وأعد المحاولة أو استخدم المتصفح. بعد التنزيل في Chrome اختر فتح باستخدام أو مشاركة إلى MLibrary."));
                });
            }
        });
    }
    @Override protected void onSaveInstanceState(Bundle state) { browser.saveState(state); super.onSaveInstanceState(state); }
    @Override protected void onDestroy() { cancelDownload(); downloads.shutdownNow(); if (browser != null) browser.destroy(); super.onDestroy(); }
}
