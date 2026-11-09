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
    BookContent | { type: "remote"; format: "epub" | "pdf"; url: string }
  >(
    `/content?${new URLSearchParams({ id: book.id, language: book.language, ...(chapter ? { chapter } : {}) })}`,
  );
  if (data.type !== "remote") return data;
  const url = new URL(data.url);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "archive.org" ||
    !url.pathname.startsWith("/download/")
  )
    throw new Error("Unsupported source file");
  const response = await fetch(url, {
    credentials: "omit",
    signal: AbortSignal.timeout(60000),
  });
  const destination = new URL(response.url);
  if (
    !response.ok ||
    destination.protocol !== "https:" ||
    !(
      destination.hostname === "archive.org" ||
      destination.hostname.endsWith(".archive.org")
    )
  )
    throw new Error("The source file could not be opened");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The source file is empty");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 50 * 1024 * 1024) {
      await reader.cancel();
      throw new Error(
        "This file exceeds the 50 MB reading limit. Use the source reader.",
      );
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let cursor = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  if (
    data.format === "pdf"
      ? new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-"
      : bytes[0] !== 80 || bytes[1] !== 75
  )
    throw new Error("The source did not return a valid book file");
  return { type: data.format, data: bytes.buffer };
}
