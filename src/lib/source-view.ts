export function trustedSourceUrl(value: string) {
  try {
    const u = new URL(value);
    const hosts = [
      "archive.org",
      "openlibrary.org",
      "gutenberg.org",
      "wikisource.org",
      "safahat.org",
      "gallica.bnf.fr",
      "standardebooks.org",
      "doabooks.org",
      "oapen.org",
      "qdl.qa",
      "unglue.it",
      "fadedpage.com",
      "globalgreyebooks.com",
      "annas-archive.gd",
      "annas-archive.gl",
      "annas-archive.pk",
    ];
    return u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      hosts.some(
        (host) => u.hostname === host || u.hostname.endsWith(`.${host}`),
      )
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export async function openNativeSource(url: string, language = "en") {
  const safe = trustedSourceUrl(url);
  if (!safe) throw new Error("Unsupported source address");
  if (["www.qdl.qa", "qdl.qa"].includes(new URL(safe).hostname)) {
    const { BookImport } = await import("./book-import");
    await BookImport.openQdl({ url: safe, language });
    return;
  }
  if (
    [
      "unglue.it",
      "www.fadedpage.com",
      "www.globalgreyebooks.com",
      "annas-archive.gd",
      "annas-archive.gl",
      "annas-archive.pk",
    ].includes(new URL(safe).hostname)
  ) {
    const { BookImport } = await import("./book-import");
    await BookImport.openPublisher({ url: safe, language });
    return;
  }
  const { InAppBrowser, DefaultWebViewOptions } = await import(
    "@capacitor/inappbrowser"
  );
  await InAppBrowser.openInWebView({
    url: safe,
    options: {
      ...DefaultWebViewOptions,
      showToolbar: true,
      showURL: true,
      clearCache: false,
      clearSessionCache: false,
      mediaPlaybackRequiresUserAction: true,
      closeButtonText: "MLibrary",
      android: {
        ...DefaultWebViewOptions.android,
        allowZoom: true,
        hardwareBack: true,
        isIsolated: true,
      },
    },
  });
}
