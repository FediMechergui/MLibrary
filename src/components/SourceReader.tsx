import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { BookOpen, ArrowLeft, UploadSimple } from "@phosphor-icons/react";
import type { BookContent, Language, Progress } from "../types";
import { openNativeSource, trustedSourceUrl } from "../lib/source-view";
import { readerText } from "../lib/reader-i18n";

export function SourceReader({
  content,
  language,
  initial,
  onProgress,
  onImport,
}: {
  content: Extract<BookContent, { type: "source" }>;
  language: Language;
  initial?: Progress;
  onProgress?: (progress: Progress) => void;
  onImport?: (file: File) => void;
}) {
  const r = readerText(language),
    frame = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState(false);
  const native = Capacitor.isNativePlatform();
  const url = trustedSourceUrl(content.embedUrl || content.url);
  const open = () => openNativeSource(content.url).catch(() => setError(true));
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (
        event.origin !== "https://archive.org" ||
        event.source !== frame.current?.contentWindow ||
        event.data?.type !== "bookReaderFragmentChange" ||
        typeof event.data.fragment !== "string"
      )
        return;
      const fragment = event.data.fragment;
      if (
        !/^page\/[A-Za-z0-9.-]+(?:\/[A-Za-z0-9.-]+)*$/.test(fragment) ||
        fragment.length > 200
      )
        return;
      const page = Number(fragment.match(/^page\/n(\d+)/)?.[1] || 0);
      onProgress?.({
        position: page,
        total: 0,
        percent: 0,
        fragment,
        updatedAt: Date.now(),
      });
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [onProgress]);
  return (
    <div
      className={`source-reader ${content.available ? "has-edition" : "needs-edition"}`}
    >
      <div className="source-reader-info">
        <BookOpen size={26} />
        <div>
          <strong>
            {r(content.available ? "sourceReader" : "unreadable")}
          </strong>
          <p>
            {content.available
              ? r("sourceNote")
              : r("unreadable") + ". " + r("sourceNote")}
          </p>
        </div>
        {onImport && (
          <label className="button secondary">
            <UploadSimple size={18} />
            {r("importCopy")}
            <input
              className="sr-only"
              type="file"
              accept=".epub,.pdf,.txt"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onImport(file);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>
      {native ? (
        <div className="source-native-open">
          <button className="button primary" onClick={open}>
            {r("openSource")}
          </button>
          <p>{r("sourceQuoteHint")}</p>
          {error && <p role="alert">{r("providerOpenError")}</p>}
        </div>
      ) : (
        url && (
          <>
            <iframe
              ref={frame}
              title={r("sourceReader")}
              src={`${url}${initial?.fragment ? `#${initial.fragment}` : ""}`}
              sandbox="allow-scripts allow-same-origin allow-forms"
              allow="fullscreen"
              referrerPolicy="no-referrer"
            />
            <p className="source-frame-help">
              {r("sourceNote")} · {r("sourceQuoteHint")}
            </p>
          </>
        )
      )}
    </div>
  );
}
export function SourcePanel({
  url,
  language,
  onClose,
}: {
  url: string;
  language: Language;
  onClose: () => void;
}) {
  const r = readerText(language);
  return (
    <div className="source-panel" role="dialog" aria-label={r("sourceReader")}>
      <header>
        <button
          className="icon-button"
          aria-label={r("back")}
          onClick={onClose}
        >
          <ArrowLeft size={23} />
        </button>
        <strong>{r("sourceReader")}</strong>
        <span>{new URL(url).hostname}</span>
      </header>
      <SourceReader
        content={{
          type: "source",
          url,
          embedUrl: url,
          available: true,
          attribution: "",
          message: "",
        }}
        language={language}
      />
    </div>
  );
}
