import {
  ArrowUpRight,
  MagnifyingGlass,
  UploadSimple,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type {
  AppState,
  Book,
  ReaderFormat,
  Source,
  SourcePreference,
} from "../types";
import { sourceText } from "../lib/source-i18n";
import { translator } from "../lib/i18n";
import { QdlImport } from "./QdlImport";
import {
  importStandardBook,
  importOpenAccessBook,
  importCollectionBook,
} from "../lib/api";
const names: Record<string, string> = {
  openiti: "OpenITI · KITAB",
  gutenberg: "Project Gutenberg",
  wikisource: "Wikisource",
  openlibrary: "Open Library",
  archive: "Internet Archive",
  oapen: "OAPEN Library",
  doab: "Directory of Open Access Books",
  gallica: "Gallica · BnF",
};
export function FormatChoice({
  language,
  value,
  onChange,
}: {
  language: AppState["language"];
  value: ReaderFormat;
  onChange: (value: ReaderFormat) => void;
}) {
  const t = sourceText(language);
  return (
    <label className="source-field">
      <span>{t("format")}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ReaderFormat)}
      >
        {(["auto", "text", "epub", "pdf"] as const).map((f) => (
          <option key={f} value={f}>
            {t(f)}
          </option>
        ))}
      </select>
    </label>
  );
}
export function SourceSettings({
  sources,
  state,
  update,
  onSearch,
  onImport,
  onVisit,
  onRead,
}: {
  sources: Source[];
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  onSearch: (source: string, language: string) => void;
  onImport: (file: File) => void;
  onVisit: (url: string) => void;
  onRead: (book: Book) => void;
}) {
  const t = sourceText(state.language);
  const labels = translator(state.language);
  const patch = (id: string, value: SourcePreference) =>
    update((s) => ({
      ...s,
      sources: { ...s.sources, [id]: { ...s.sources[id], ...value } },
    }));
  return (
    <div className="source-list">
      {sources.map((source, i) => {
        const config = state.sources[source.id] || {};
        const connected = !!names[source.id];
        const fallback =
          config.fallback ||
          (source.languages[0] === "ar" ||
          ["gallica", "gutenberg"].includes(source.id)
            ? "wikisource"
            : "gutenberg");
        const language =
          config.language ||
          (source.languages.length === 1 ? source.languages[0] : "all");
        return (
          <article
            className="source-row"
            key={source.id}
            data-source={source.id}
          >
            <span className="source-number">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="source-body">
              <span
                className={`source-status ${source.audit?.status || "directory"}`}
              >
                {t(source.audit?.status || "directory")}
              </span>
              <span className={`source-tag ${source.kind}`}>
                {labels(
                  source.kind === "integrated"
                    ? "integrated"
                    : source.kind === "discovery"
                      ? "discovery"
                      : "directory",
                )}
              </span>
              <h3>{source.name}</h3>
              <p>{source.description}</p>
              {source.id === "qdl" && <QdlImport language={state.language} />}
              <details className="source-settings">
                <summary>{t("settings")}</summary>
                {source.id === "standardebooks" && (
                  <StandardImport language={state.language} onRead={onRead} />
                )}
                {["oapen", "doab", "hindawi", "gallica"].includes(
                  source.id,
                ) && (
                  <StandardImport
                    language={state.language}
                    onRead={onRead}
                    repository={source.id}
                  />
                )}
                {source.audit && (
                  <div className="source-diagnosis">
                    <small>
                      {t("checked")}{" "}
                      {new Date(source.audit.checkedAt).toLocaleDateString(
                        state.language,
                      )}
                    </small>
                    <h4>{t("finding")}</h4>
                    <p>{source.audit.finding}</p>
                    <h4>{t("solution")}</h4>
                    <p>{source.audit.solution}</p>
                  </div>
                )}
                {connected && (
                  <label className="source-toggle">
                    <input
                      type="checkbox"
                      checked={config.enabled !== false}
                      onChange={(e) =>
                        patch(source.id, { enabled: e.target.checked })
                      }
                    />
                    {t("enabled")}
                  </label>
                )}
                <div className="source-controls">
                  {["archive", "openlibrary", "oapen", "doab"].includes(
                    source.id,
                  ) && (
                    <FormatChoice
                      language={state.language}
                      value={config.format || "auto"}
                      onChange={(format) => patch(source.id, { format })}
                    />
                  )}
                  <label className="source-field">
                    <span>{t("language")}</span>
                    <select
                      value={language}
                      onChange={(e) =>
                        patch(source.id, { language: e.target.value })
                      }
                    >
                      <option value="all">{t("all")}</option>
                      {source.languages.map((l) => (
                        <option key={l} value={l}>
                          {{ en: "English", fr: "Français", ar: "العربية" }[l]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="source-field">
                    <span>{t("fallback")}</span>
                    <select
                      value={fallback}
                      onChange={(e) =>
                        patch(source.id, { fallback: e.target.value })
                      }
                    >
                      {Object.entries(names)
                        .filter(([id]) => id !== source.id)
                        .map(([id, name]) => (
                          <option key={id} value={id}>
                            {name}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
                {["archive", "openlibrary", "oapen", "doab"].includes(
                  source.id,
                ) && <p className="source-hint">{t("saved")}</p>}
                <div className="source-recovery">
                  <button
                    className="button secondary"
                    onClick={() => onSearch(fallback, language)}
                  >
                    <MagnifyingGlass size={18} />
                    {t("alternate")}
                  </button>
                  <label className="button secondary">
                    <UploadSimple size={18} />
                    {t("import")}
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
                </div>
                <small>{source.rights}</small>
              </details>
            </div>
            <div className="source-actions">
              <span>
                {source.languages.map((l) => l.toUpperCase()).join(" · ")}
              </span>
              {connected && (
                <button
                  className="text-button"
                  onClick={() => onSearch(source.id, language)}
                >
                  {t("search")}
                  <MagnifyingGlass size={18} />
                </button>
              )}
              <button
                className="text-button"
                onClick={() => onVisit(source.url)}
              >
                {t("visit")}
                <ArrowUpRight size={18} />
              </button>
            </div>
          </article>
        );
      })}
      <p className="source-hint">{t("note")}</p>
    </div>
  );
}
function StandardImport({
  language,
  onRead,
  repository,
}: {
  language: AppState["language"];
  onRead: (book: Book) => void;
  repository?: string;
}) {
  const t = sourceText(language);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const collection = repository === "hindawi" || repository === "gallica";
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  return (
    <form
      className="publisher-import"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        controller.current?.abort();
        const request = new AbortController();
        controller.current = request;
        try {
          const data = collection
            ? await importCollectionBook(
                url.trim(),
                repository!,
                request.signal,
              )
            : await (repository ? importOpenAccessBook : importStandardBook)(
                url.trim(),
                request.signal,
              );
          if (!request.signal.aborted) onRead(data.book);
        } catch (e) {
          if (!request.signal.aborted)
            setError(e instanceof Error ? e.message : t("missing"));
        } finally {
          if (!request.signal.aborted) setBusy(false);
        }
      }}
    >
      <label className="source-field">
        <span>
          {t(
            collection
              ? "collectionLink"
              : repository
                ? "repositoryLink"
                : "bookLink",
          )}
        </span>
        <input
          type="url"
          required
          value={url}
          placeholder={
            repository === "hindawi"
              ? "https://www.safahat.org/books/86869064/"
              : repository === "gallica"
                ? "https://gallica.bnf.fr/ark:/12148/…"
                : repository
                  ? `https://${repository === "oapen" ? "library.oapen.org" : "directory.doabooks.org"}/handle/…`
                  : "https://standardebooks.org/ebooks/…"
          }
          onChange={(e) => setUrl(e.target.value)}
        />
      </label>
      <p className="source-hint">
        {t(
          repository === "hindawi"
            ? "safahatHint"
            : repository === "gallica"
              ? "gallicaHint"
              : repository
                ? "repositoryHint"
                : "linkHint",
        )}
      </p>
      <button className="button primary" disabled={busy}>
        {t(busy ? (repository ? "findingBook" : "opening") : "downloadRead")}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
