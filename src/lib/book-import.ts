import { trustedSourceUrl } from "./source-view";
import { Capacitor, registerPlugin } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";
import { importBook } from "./state";
import type { Book } from "../types";

export type IncomingBook = {
  id: string;
  name: string;
  size: number;
  path: string;
  sourceUrl: string;
  title: string;
};
export const BookImport = registerPlugin<{
  openPublisher(options: { url: string; language: string }): Promise<void>;
  openQdl(options: { url: string; language: string }): Promise<void>;
  pending(): Promise<{ items: IncomingBook[] }>;
  complete(options: { id: string }): Promise<void>;
  addListener(
    event: "ready" | "importError",
    listener: () => void,
  ): Promise<PluginListenerHandle>;
}>("BookImport");

export function qdlUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      ["qdl.qa", "www.qdl.qa"].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/** Acknowledge the native staging file only after both offline content and shelf are saved. */
export async function importIncoming(
  item: IncomingBook,
  language: string,
  adopt: (book: Book) => void,
) {
  if (
    !item.path.startsWith("file:///") ||
    item.size <= 0 ||
    item.size > 50 * 1024 * 1024
  )
    throw new Error("Invalid incoming file");
  const response = await fetch(Capacitor.convertFileSrc(item.path));
  if (!response.ok) throw new Error("Incoming file unavailable");
  const blob = await response.blob();
  if (blob.size !== item.size) throw new Error("Incomplete incoming file");
  const sourceUrl = trustedSourceUrl(item.sourceUrl);
  const title = item.title
    ?.replace(/\s*[|–-]\s*Qatar Digital Library\s*$/i, "")
    .trim();
  const book = await importBook(
    new File([blob], item.name),
    language,
    sourceUrl
      ? {
          sourceUrl,
          title:
            qdlUrl(item.sourceUrl) &&
            title &&
            !/just a moment|qatar digital library|attention required/i.test(
              title,
            )
              ? title
              : undefined,
        }
      : undefined,
  );
  adopt(book);
  // React's shelf update must have committed before the original can be removed.
  const saved = JSON.parse(localStorage.getItem("mlibrary:v1") || "null");
  if (!saved?.shelf?.[book.id]?.offline)
    throw new Error("Shelf could not be saved");
  await BookImport.complete({ id: item.id });
}
