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
export async function openNativeSource(url: string) {
  const safe = trustedSourceUrl(url);
  if (!safe) throw new Error("Unsupported source address");
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
