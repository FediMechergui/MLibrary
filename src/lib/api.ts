import type { Book, BookContent, SearchResult, Source } from "../types";
import { offlineBook } from "./state";
export const API = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API}/api${path}`, {
    signal: signal || AbortSignal.timeout(30000),
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error || "The source is temporarily unavailable.");
  return body;
}
export const searchBooks = (
  filters: { q: string; language: string; source: string; page: number },
  signal?: AbortSignal,
) =>
  request<SearchResult>(
    `/search?${new URLSearchParams(Object.entries(filters).map(([k, v]) => [k, String(v)]))}`,
    signal,
  );
export const getSources = () => request<{ sources: Source[] }>("/sources");
export const getSyncStatus = () =>
  request<{ status: string; records: number; lastSuccess?: string }>(
    "/sync-status",
  );
export async function loadBook(
  book: Book,
  chapter?: string,
): Promise<BookContent> {
  const local = await offlineBook(book.id);
  if (
    local &&
    (!chapter || (local.type === "text" && local.chapter === chapter))
  )
    return local;
  if (["gutenberg:1342", "gutenberg:11"].includes(book.id)) {
    const response = await fetch(`/data/${book.id.replace(":", "-")}.json`);
    if (response.ok) return response.json();
  }
  if (book.source === "local")
    throw new Error(
      "The imported file is missing from this device. Please import it again.",
    );
  const data = await request<
    | BookContent
    | {
        type: "remote";
        format: "epub" | "pdf";
        url: string;
        attribution?: string;
        sourceUrl?: string;
      }
  >(
    `/content?${new URLSearchParams({ id: book.id, language: book.language, ...(chapter ? { chapter } : {}) })}`,
  );
  if (data.type !== "remote") return data;
  const url = archiveFileUrl(data.url);
  if (data.format === "pdf")
    return {
      type: "pdf-url",
      url: url.href,
      attribution: data.attribution,
      sourceUrl: data.sourceUrl,
    };
  return downloadReaderFile(url.href, "epub");
}
function archiveFileUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "archive.org" ||
    url.username ||
    url.password ||
    url.port ||
    !url.pathname.startsWith("/download/")
  )
    throw new Error("Unsupported source file");
  return url;
}
export async function downloadReaderFile(
  value: string,
  format: "epub" | "pdf",
): Promise<Extract<BookContent, { type: "epub" | "pdf" }>> {
  const first = await readerFileChunk(value, 0, 1024 * 1024);
  if (first.size > 50 * 1024 * 1024)
    throw new Error("This file exceeds the 50 MB offline download limit.");
  const bytes = new Uint8Array(first.size);
  bytes.set(first.bytes);
  for (
    let cursor = first.bytes.length;
    cursor < first.size;
    cursor += 1024 * 1024
  ) {
    const chunk = await readerFileChunk(
      value,
      cursor,
      Math.min(cursor + 1024 * 1024, first.size),
    );
    bytes.set(chunk.bytes, cursor);
  }
  if (
    format === "pdf"
      ? new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-"
      : bytes[0] !== 80 || bytes[1] !== 75
  )
    throw new Error("The source did not return a valid book file");
  return { type: format, data: bytes.buffer };
}

export async function readerFileChunk(
  value: string,
  start: number,
  end: number,
  signal?: AbortSignal,
) {
  const url = archiveFileUrl(value);
  const parts = url.pathname.split("/");
  if (parts.length !== 4) throw new Error("Unsupported source file");
  const query = new URLSearchParams({
    id: decodeURIComponent(parts[2]),
    name: decodeURIComponent(parts[3]),
    start: String(start),
    end: String(end - 1),
  });
  const response = await fetch(`${API}/api/file?${query}`, {
    signal: signal || AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "The book file could not be loaded.");
  }
  const size = Number(response.headers.get("X-Book-Length"));
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    size > 500 * 1024 * 1024 ||
    bytes.length !== Math.min(end, size) - start
  )
    throw new Error("The source returned an incomplete book file.");
  return { bytes, size };
}
