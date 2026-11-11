import { useState } from "react";
import type { Book, Language } from "../types";
import { studioText } from "../lib/studio-i18n";
export function BookDetailsEditor({
  book,
  language,
  onSave,
  onCancel,
}: {
  book: Book;
  language: Language;
  onSave: (book: Book) => void;
  onCancel: () => void;
}) {
  const t = studioText(language),
    [error, setError] = useState("");
  return (
    <form
      className="book-details-editor"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget),
          title = String(data.get("title") || "").trim();
        if (!title) {
          setError(t("required"));
          return;
        }
        const lang = String(data.get("language") || "en"),
          year = Number(data.get("year"));
        onSave({
          ...book,
          title,
          authors: String(data.get("author") || "")
            .split(/[;؛\n]/)
            .map((v) => v.trim())
            .filter(Boolean)
            .slice(0, 20),
          language: lang,
          languages: [lang],
          description: String(data.get("description") || "").trim(),
          year: year > 0 && year < 3000 ? year : undefined,
        });
      }}
    >
      <h3>{t("details")}</h3>
      <label>
        {t("title")}
        <input
          name="title"
          autoFocus
          defaultValue={book.title}
          maxLength={500}
          required
          dir="auto"
        />
      </label>
      <label>
        {t("author")}
        <input
          name="author"
          aria-label={t("author")}
          defaultValue={book.authors.join("; ")}
          maxLength={1000}
          dir="auto"
        />
        <small>{t("authorsHint")}</small>
      </label>
      <div className="book-fields-row">
        <label>
          {t("language")}
          <select name="language" defaultValue={book.language || "en"}>
            <option value="en">English</option>
            <option value="fr">Français</option>
            <option value="ar">العربية</option>
            {!["en", "fr", "ar"].includes(book.language) && (
              <option value={book.language}>{book.language}</option>
            )}
          </select>
        </label>
        <label>
          {t("year")}
          <input
            type="number"
            name="year"
            min="1"
            max="2999"
            defaultValue={book.year || ""}
          />
        </label>
      </div>
      <label>
        {t("description")}
        <textarea
          name="description"
          defaultValue={book.description}
          maxLength={4000}
          rows={3}
          dir="auto"
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <div className="editor-actions">
        <button
          className="button secondary"
          data-modal-close
          type="button"
          onClick={onCancel}
        >
          {t("cancel")}
        </button>
        <button className="button primary" type="submit">
          {t("save")}
        </button>
      </div>
    </form>
  );
}
