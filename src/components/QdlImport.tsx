import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { BookImport, qdlUrl } from "../lib/book-import";
import { importText } from "../lib/import-i18n";
import type { Language } from "../types";

export function QdlImport({
  language,
  initialUrl = "",
}: {
  language: Language;
  initialUrl?: string;
}) {
  const [url, setUrl] = useState(initialUrl),
    [error, setError] = useState("");
  const t = importText(language),
    native = Capacitor.isNativePlatform();
  return (
    <form
      className="qdl-import"
      onSubmit={(event) => {
        event.preventDefault();
        setError("");
        const safe = qdlUrl(
          url.trim() || `https://www.qdl.qa/${language === "ar" ? "ar" : "en"}`,
        );
        if (!safe) {
          setError(t("invalid"));
          return;
        }
        if (native)
          void BookImport.openQdl({ url: safe, language }).catch(() =>
            setError(t("openingError")),
          );
        else window.open(safe, "_blank", "noopener,noreferrer");
      }}
    >
      <p>{t(native ? "hint" : "webHint")}</p>
      <label className="source-field">
        <span>{t("url")}</span>
        <input
          type="url"
          dir="ltr"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://www.qdl.qa/en/archive/…"
        />
      </label>
      <button className="button primary" type="submit">
        {t("browse")}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
