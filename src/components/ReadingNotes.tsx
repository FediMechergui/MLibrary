import { useEffect, useRef, useState } from "react";
import {
  Quotes,
  X,
  Heart,
  DownloadSimple,
  ShareNetwork,
  Copy,
  PencilSimple,
  ArrowUpRight,
  Trash,
  Plus,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import type {
  AppState,
  Book,
  HighlightColor,
  Language,
  ReaderSelection,
  ReadingMark,
} from "../types";
import { highlightColors, normalizeTags } from "../lib/annotations";
import { readerText } from "../lib/reader-i18n";
import { studioText } from "../lib/studio-i18n";
import { QuoteStudio, QuotePreview } from "./QuoteStudio";
import { quotePalettes } from "../lib/quote-design";

type StateProps = {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  notify: (text: string) => void;
};
export function MarkEditor({
  book,
  selection,
  existing,
  state,
  update,
  notify,
  onClose,
}: StateProps & {
  book: Book;
  selection: ReaderSelection;
  existing?: ReadingMark;
  onClose: () => void;
}) {
  const r = readerText(state.language);
  const editor = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    editor.current?.focus({ preventScroll: true });
    return () => previous?.focus({ preventScroll: true });
  }, []);
  const [text, setText] = useState(selection.text);
  const [note, setNote] = useState(existing?.note || "");
  const [tags, setTags] = useState(existing?.tags.join(", ") || "");
  const [color, setColor] = useState<HighlightColor>(
    existing?.color || state.settings.highlightColor,
  );
  const save = (quoted: boolean) => {
    if (!text.trim() || text.length > 5000) {
      notify(r("quoteTooLong"));
      return;
    }
    const mark: ReadingMark = {
      id: existing?.id || crypto.randomUUID(),
      book,
      text,
      anchor: selection.anchor,
      color,
      note: note.trim(),
      tags: normalizeTags(tags),
      quoted: quoted || !!existing?.quoted,
      favorite: existing?.favorite || false,
      cardStyle: existing?.cardStyle || "paper",
      cardDesign: existing?.cardDesign,
      createdAt: existing?.createdAt || Date.now(),
    };
    update((s) => ({
      ...s,
      marks: { ...s.marks, [mark.id]: mark },
      settings: { ...s.settings, highlightColor: color },
    }));
    window.getSelection()?.removeAllRanges();
    notify(r(quoted ? "quoteSaved" : "highlightSaved"));
    onClose();
  };
  return (
    <section
      className="mark-editor"
      ref={editor}
      tabIndex={-1}
      role="dialog"
      aria-label={r("highlights")}
      dir={state.language === "ar" ? "rtl" : "ltr"}
      onKeyDown={(e) => {
        if (e.key === "Tab") {
          const nodes = editor.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input,textarea",
          );
          if (nodes?.length) {
            const first = nodes[0],
              last = nodes[nodes.length - 1];
            if (
              e.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === editor.current)
            ) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="panel-heading">
        <strong>
          <Quotes size={21} /> {r("manualQuote")}
        </strong>
        <button
          className="icon-button"
          aria-label={r("close")}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <p className="quote-attribution" dir="auto">
        <strong>{book.title}</strong>
        <span>{book.authors.join(" · ")}</span>
      </p>
      {selection.anchor.ocr && <p>{studioText(state.language)("ocrReview")}</p>}
      {selection.anchor.type === "source" || selection.anchor.ocr ? (
        <label>
          {r("quoteText")}
          <textarea
            aria-label={r("quoteText")}
            autoFocus
            maxLength={5000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            dir="auto"
          />
        </label>
      ) : (
        <blockquote dir="auto">{text}</blockquote>
      )}
      <div className="highlight-colors" role="group" aria-label={r("color")}>
        {(Object.keys(highlightColors) as HighlightColor[]).map((c) => (
          <button
            key={c}
            aria-label={r(c)}
            aria-pressed={color === c}
            onClick={() => setColor(c)}
            style={{ background: highlightColors[c] }}
          />
        ))}
      </div>
      <label>
        {r("note")}
        <textarea
          aria-label={r("note")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={4000}
          rows={2}
          placeholder={r("notePlaceholder")}
        />
      </label>
      <label>
        {r("tags")}
        <input
          aria-label={r("tags")}
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder={r("tagsHint")}
          maxLength={400}
        />
      </label>
      <div className="editor-actions">
        {selection.anchor.type !== "source" && (
          <button className="button secondary" onClick={() => save(false)}>
            {r(existing ? "saveChanges" : "saveHighlight")}
          </button>
        )}
        <button
          className="button primary"
          disabled={!text.trim()}
          onClick={() => save(true)}
        >
          <Quotes size={17} />
          {r("saveQuote")}
        </button>
      </div>
    </section>
  );
}

export function MyQuotes({
  state,
  update,
  notify,
  onRead,
}: StateProps & { onRead: (book: Book, mark: ReadingMark) => void }) {
  const r = readerText(state.language);
  const [query, setQuery] = useState(""),
    [tag, setTag] = useState(""),
    [favorites, setFavorites] = useState(false),
    [editing, setEditing] = useState<ReadingMark | null>(null),
    [adding, setAdding] = useState(false);
  const [designing, setDesigning] = useState<ReadingMark | null>(null);
  const [title, setTitle] = useState(""),
    [author, setAuthor] = useState("");
  const all = Object.values(state.marks)
    .filter((m) => m.quoted)
    .sort((a, b) => b.createdAt - a.createdAt);
  const tags = [...new Set(all.flatMap((m) => m.tags))];
  const filtered = all.filter(
    (m) =>
      (!favorites || m.favorite) &&
      (!tag || m.tags.includes(tag)) &&
      `${m.text} ${m.note} ${m.book.title} ${m.book.authors.join(" ")} ${m.tags.join(" ")}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  const patch = (id: string, value: Partial<ReadingMark>) =>
    update((s) => ({
      ...s,
      marks: { ...s.marks, [id]: { ...s.marks[id], ...value } },
    }));
  const copy = async (mark: ReadingMark) => {
    try {
      await navigator.clipboard.writeText(
        `“${mark.text}”\n— ${mark.book.authors.join(", ")}, ${mark.book.title}`,
      );
      notify(r("copied"));
    } catch {
      notify(r("exportError"));
    }
  };
  const manualBook: Book = {
    id: `quote-book:${crypto.randomUUID()}`,
    title: title.trim(),
    authors: [author.trim()].filter(Boolean),
    language: state.language,
    languages: [state.language],
    source: "personal",
    sourceUrl: "",
    cover: null,
    subjects: [],
    description: "",
    access: "source",
    rights: "",
    formats: [],
  };
  return (
    <section className="quotes-page">
      <div className="collection-heading">
        <div>
          <span className="eyebrow">
            {r("quotes")} · {all.length.toLocaleString(state.language)}
          </span>
          <h1>{r("quotesTitle")}</h1>
          <p>{r("quotesCopy")}</p>
        </div>
        <button className="button primary" onClick={() => setAdding(true)}>
          <Plus size={19} />
          {r("addQuote")}
        </button>
      </div>
      {all.length > 0 && (
        <>
          <div className="quotes-toolbar">
            <label className="quote-search">
              <MagnifyingGlass size={19} />
              <input
                aria-label={r("searchQuotes")}
                placeholder={r("searchQuotes")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <button
              className={`chip ${favorites ? "active" : ""}`}
              aria-pressed={favorites}
              onClick={() => setFavorites(!favorites)}
            >
              <Heart size={16} weight={favorites ? "fill" : "regular"} />
              {r("favorites")}
            </button>
          </div>
          <div className="tag-filters">
            <button
              className={`chip ${!tag ? "active" : ""}`}
              onClick={() => setTag("")}
            >
              {r("allQuotes")}
            </button>
            {tags.map((t) => (
              <button
                key={t}
                className={`chip ${tag === t ? "active" : ""}`}
                onClick={() => setTag(t)}
              >
                #{t}
              </button>
            ))}
          </div>
        </>
      )}
      {!all.length ? (
        <div className="quotes-empty">
          <Quotes size={54} weight="thin" />
          <h2>{r("noQuotes")}</h2>
          <p>{r("noQuotesCopy")}</p>
          <div className="empty-quote-lines">
            <i />
            <i />
            <i />
          </div>
        </div>
      ) : !filtered.length ? (
        <div className="empty-state">
          <p>{r("emptyFilter")}</p>
        </div>
      ) : (
        <div className="quote-grid">
          {filtered.map((mark) => (
            <article
              className={`quote-card card-${mark.cardStyle}`}
              key={mark.id}
            >
              <div className="quote-card-top">
                <span>
                  {new Date(mark.createdAt).toLocaleDateString(state.language, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <button
                  className="icon-button"
                  aria-label={r("favorite")}
                  aria-pressed={mark.favorite}
                  onClick={() => patch(mark.id, { favorite: !mark.favorite })}
                >
                  <Heart
                    weight={mark.favorite ? "fill" : "regular"}
                    size={20}
                  />
                </button>
              </div>
              <span className="quote-glyph" aria-hidden="true">
                “
              </span>
              {mark.cardDesign ? (
                <QuotePreview mark={mark} />
              ) : (
                <blockquote dir="auto">{mark.text}</blockquote>
              )}
              <div className="quote-attribution">
                <strong dir="auto">{mark.book.title}</strong>
                <span dir="auto">{mark.book.authors.join(" · ")}</span>
              </div>
              {mark.note && (
                <p className="quote-note" dir="auto">
                  {mark.note}
                </p>
              )}
              <div className="quote-tags">
                {mark.tags.map((t) => (
                  <button key={t} onClick={() => setTag(t)}>
                    #{t}
                  </button>
                ))}
              </div>
              <div className="quote-card-bottom">
                <span>MLibrary</span>
                <div>
                  {(["paper", "forest", "clay"] as const).map((style) => (
                    <button
                      key={style}
                      className={`card-swatch swatch-${style}`}
                      aria-label={r(`${style}Card`)}
                      aria-pressed={mark.cardStyle === style}
                      onClick={() =>
                        patch(mark.id, {
                          cardStyle: style,
                          ...(mark.cardDesign
                            ? {
                                cardDesign: {
                                  ...mark.cardDesign,
                                  ...quotePalettes[
                                    style === "forest"
                                      ? 1
                                      : style === "clay"
                                        ? 2
                                        : 0
                                  ],
                                },
                              }
                            : {}),
                        })
                      }
                    />
                  ))}
                </div>
              </div>
              <div className="quote-actions">
                <button
                  className="customize-quote"
                  onClick={() => setDesigning(mark)}
                >
                  {studioText(state.language)("customize")}
                </button>
                <button
                  aria-label={r("edit")}
                  title={r("edit")}
                  onClick={() => setEditing(mark)}
                >
                  <PencilSimple size={19} />
                </button>
                <button
                  aria-label={r("copyText")}
                  title={r("copyText")}
                  onClick={() => void copy(mark)}
                >
                  <Copy size={19} />
                </button>
                <button
                  aria-label={r("exportCard")}
                  title={r("exportCard")}
                  onClick={() => setDesigning(mark)}
                >
                  <DownloadSimple size={19} />
                </button>
                <button
                  aria-label={r("shareCard")}
                  title={r("shareCard")}
                  onClick={() => setDesigning(mark)}
                >
                  <ShareNetwork size={19} />
                </button>
                {mark.book.source !== "personal" && (
                  <button
                    aria-label={r("goToPassage")}
                    title={r("goToPassage")}
                    onClick={() => onRead(mark.book, mark)}
                  >
                    <ArrowUpRight size={19} />
                  </button>
                )}
                <button
                  aria-label={r("removeQuote")}
                  title={r("removeQuote")}
                  onClick={() => {
                    patch(mark.id, { quoted: false });
                    notify(r("quoteRemoved"));
                  }}
                >
                  <Trash size={18} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {(editing || adding) && (
        <div
          className="notes-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setEditing(null);
              setAdding(false);
            }
          }}
        >
          <div className="quote-edit-wrap">
            {adding && (
              <div className="manual-book-fields">
                <p>{r("newQuoteHint")}</p>
                <label>
                  {r("bookTitle")}
                  <input
                    value={title}
                    maxLength={160}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <label>
                  {r("author")}
                  <input
                    value={author}
                    maxLength={160}
                    onChange={(e) => setAuthor(e.target.value)}
                  />
                </label>
              </div>
            )}
            {editing || title.trim() ? (
              <MarkEditor
                key={editing?.id || "new"}
                book={editing?.book || manualBook}
                selection={
                  editing || { text: "", anchor: { type: "source", page: 0 } }
                }
                existing={editing || undefined}
                state={state}
                update={update}
                notify={notify}
                onClose={() => {
                  setEditing(null);
                  setAdding(false);
                  setTitle("");
                  setAuthor("");
                }}
              />
            ) : (
              <button
                className="button secondary"
                onClick={() => setAdding(false)}
              >
                {r("cancel")}
              </button>
            )}
          </div>
        </div>
      )}
      {designing && (
        <QuoteStudio
          mark={designing}
          language={state.language}
          onSave={(cardDesign) => patch(designing.id, { cardDesign })}
          onClose={() => setDesigning(null)}
        />
      )}
    </section>
  );
}

export function ReadingPreferences({
  state,
  update,
}: Pick<StateProps, "state" | "update">) {
  const r = readerText(state.language);
  const toggle = (key: "genres" | "purposes" | "languages", value: string) =>
    update((s) => {
      const values = s.preferences[key];
      const next = values.includes(value as Language)
        ? values.filter((v) => v !== value)
        : [...values, value];
      if (key === "languages" && !next.length) return s;
      return { ...s, preferences: { ...s.preferences, [key]: next } };
    });
  const subjects = {
    en: [
      "Fiction",
      "Poetry",
      "History",
      "Philosophy",
      "Science",
      "Adventure",
      "Fantasy",
      "Biography",
    ],
    fr: [
      "Romans",
      "Poésie",
      "Histoire",
      "Philosophie",
      "Sciences",
      "Aventure",
      "Imaginaire",
      "Biographies",
    ],
    ar: [
      "روايات",
      "شعر",
      "تاريخ",
      "فلسفة",
      "علوم",
      "مغامرات",
      "خيال",
      "سير ذاتية",
    ],
  };
  return (
    <section className="preferences-panel">
      <div>
        <span className="eyebrow">MLibrary / YOU</span>
        <h2>{r("preferences")}</h2>
        <p>{r("preferencesCopy")}</p>
      </div>
      <fieldset>
        <legend>{r("genres")}</legend>
        <div className="preference-chips">
          {subjects.en.map((v, i) => (
            <button
              key={v}
              className={`chip ${state.preferences.genres.includes(v) ? "active" : ""}`}
              aria-pressed={state.preferences.genres.includes(v)}
              onClick={() => toggle("genres", v)}
            >
              {subjects[state.language][i]}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>{r("purposes")}</legend>
        <div className="preference-chips">
          {(["escape", "learn", "reflect", "research"] as const).map((v) => (
            <button
              key={v}
              className={`chip ${state.preferences.purposes.includes(v) ? "active" : ""}`}
              aria-pressed={state.preferences.purposes.includes(v)}
              onClick={() => toggle("purposes", v)}
            >
              {r(v)}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>{r("readingLanguages")}</legend>
        <div className="preference-chips">
          {(["en", "fr", "ar"] as const).map((v, i) => (
            <button
              key={v}
              className={`chip ${state.preferences.languages.includes(v) ? "active" : ""}`}
              aria-pressed={state.preferences.languages.includes(v)}
              onClick={() => toggle("languages", v)}
            >
              {["English", "Français", "العربية"][i]}
            </button>
          ))}
        </div>
      </fieldset>
    </section>
  );
}
