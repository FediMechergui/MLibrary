import type { Book, BookContent, SearchResult, Source } from "../types";
import { offlineBook, saveOffline } from "./state";
export const API = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
export type DownloadProgress = {
  received: number;
  total: number;
  phase: "downloading" | "saving";
};
type DownloadOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: DownloadProgress) => void;
};
function requestSignal(signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(45000);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}
async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API}/api${path}`, {
    signal: requestSignal(signal),
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
  options: DownloadOptions = {},
): Promise<{ content: BookContent; offline: boolean }> {
  const local = await offlineBook(book.id);
  options.signal?.throwIfAborted();
  if (
    local &&
    (!chapter || (local.type === "text" && local.chapter === chapter))
  )
    return { content: local, offline: true };
  if (["gutenberg:1342", "gutenberg:11"].includes(book.id)) {
    const response = await fetch(`/data/${book.id.replace(":", "-")}.json`, {
      signal: requestSignal(options.signal),
    });
    if (response.ok) return { content: await response.json(), offline: false };
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
    `/content?${new URLSearchParams({ id: book.id, language: book.language, reader: "2", ...(chapter ? { chapter } : {}) })}`,
    options.signal,
  );
  const downloadedText =
    data.type === "text" &&
    ["archive", "openlibrary"].includes(book.source) &&
    !data.chapters.length;
  if (data.type !== "remote" && !downloadedText)
    return { content: data, offline: false };
  const content: BookContent =
    data.type === "remote"
      ? {
          ...(await downloadReaderFile(data.url, data.format, options)),
          attribution: data.attribution,
          sourceUrl: data.sourceUrl,
        }
      : data;
  options.signal?.throwIfAborted();
  options.onProgress?.({ received: 1, total: 1, phase: "saving" });
  try {
    // Publish only a complete file. Interrupted downloads never become offline books.
    await saveOffline(book.id, content);
  } catch {
    throw new Error(
      "The downloaded book could not be saved. Free some device storage and try again.",
    );
  }
  return { content, offline: true };
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
  options: DownloadOptions = {},
): Promise<Extract<BookContent, { type: "epub" | "pdf" }>> {
  options.onProgress?.({ received: 0, total: 0, phase: "downloading" });
  const first = await readerFileChunk(value, 0, 1024 * 1024, options.signal);
  if (first.size > (format === "pdf" ? 500 : 50) * 1024 * 1024)
    throw new Error(
      `This file exceeds the ${format === "pdf" ? 500 : 50} MB download limit.`,
    );
  if (
    format === "pdf"
      ? new TextDecoder().decode(first.bytes.slice(0, 5)) !== "%PDF-"
      : first.bytes[0] !== 80 || first.bytes[1] !== 75
  )
    throw new Error("The source did not return a valid book file");
  // Blobs avoid allocating one enormous contiguous PDF buffer on a phone.
  const parts: Blob[] = [new Blob([first.bytes])];
  options.onProgress?.({
    received: first.bytes.length,
    total: first.size,
    phase: "downloading",
  });
  for (
    let cursor = first.bytes.length;
    cursor < first.size;
    cursor += 1024 * 1024
  ) {
    const chunk = await readerFileChunk(
      value,
      cursor,
      Math.min(cursor + 1024 * 1024, first.size),
      options.signal,
    );
    if (chunk.size !== first.size)
      throw new Error(
        "The source file changed during download. Please try again.",
      );
    parts.push(new Blob([chunk.bytes]));
    options.onProgress?.({
      received: cursor + chunk.bytes.length,
      total: first.size,
      phase: "downloading",
    });
  }
  options.signal?.throwIfAborted();
  const file = new Blob(parts, {
    type: format === "pdf" ? "application/pdf" : "application/epub+zip",
  });
  return format === "pdf"
    ? { type: "pdf", data: file }
    : { type: "epub", data: await file.arrayBuffer() };
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
    signal: requestSignal(signal),
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
