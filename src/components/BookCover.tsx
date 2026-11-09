import type { Book } from "../types";
import { useState } from "react";
export function BookCover({
  book,
  large = false,
}: {
  book: Book;
  large?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const hash = [...book.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const useImage = book.cover && book.source !== "gutenberg" && !failed;
  return (
    <div
      className={`book-cover palette-${hash % 7} ${large ? "large" : ""}`}
      dir={book.language === "ar" ? "rtl" : "ltr"}
    >
      {useImage ? (
        <img
          src={book.cover!}
          alt={book.title}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <>
          <span className="cover-author">
            {book.authors[0]?.replace(/^([^,]+), (.+)$/, "$2 $1") || "MLibrary"}
          </span>
          <strong>{book.title}</strong>
          <div className={`cover-art art-${hash % 4}`} aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
          <span className="cover-edition">
            {book.language === "ar"
              ? "المكتبة المفتوحة"
              : "THE LIBRARY EDITION"}
          </span>
        </>
      )}
    </div>
  );
}
