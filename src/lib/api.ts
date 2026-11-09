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
export async function loadBook(book: Book): Promise<BookContent> {
  const local = await offlineBook(book.id);
  if (local) return local;
  if (["gutenberg:1342", "gutenberg:11"].includes(book.id)) {
    const response = await fetch(`/data/${book.id.replace(":", "-")}.json`);
    if (response.ok) return response.json();
  }
  if (book.source === "local")
    throw new Error(
      "The imported file is missing from this device. Please import it again.",
    );
  return request<BookContent>(`/content?id=${encodeURIComponent(book.id)}`);
}
