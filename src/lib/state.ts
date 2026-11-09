import { useState, useCallback } from "react";
import { get, set, del } from "idb-keyval";
import type { AppState, Book, BookContent } from "../types";
const KEY = "mlibrary:v1";
export const defaults: AppState = {
  version: 1,
  language: "en",
  shelf: {},
  activity: {},
  dailyGoal: 20,
  settings: {
    theme: "paper",
    mode: "flip",
    fontSize: 20,
    lineHeight: 1.8,
    font: "serif",
  },
};
function load(): AppState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    return raw?.version === 1
      ? {
          ...defaults,
          ...raw,
          settings: { ...defaults.settings, ...raw.settings },
        }
      : defaults;
  } catch {
    return defaults;
  }
}
export function useLibraryState() {
  const [state, setState] = useState<AppState>(load);
  const update = useCallback(
    (fn: (previous: AppState) => AppState) =>
      setState((previous) => {
        const next = fn(previous);
        try {
          localStorage.setItem(KEY, JSON.stringify(next));
        } catch {
          window.dispatchEvent(new Event("mlibrary-storage-error"));
        }
        return next;
      }),
    [],
  );
  return [state, update] as const;
}
export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function currentStreak(activity: Record<string, number>) {
  const day = new Date();
  if (!(activity[localDay(day)] >= 60)) day.setDate(day.getDate() - 1);
  let streak = 0;
  while (activity[localDay(day)] >= 60) {
    streak++;
    day.setDate(day.getDate() - 1);
  }
  return streak;
}
export const offlineBook = (id: string) => get<BookContent>(`book:${id}`);
export const saveOffline = (id: string, content: BookContent) =>
  set(`book:${id}`, content);
export const deleteOffline = (id: string) => del(`book:${id}`);
export const newEntry = (book: Book) => ({
  book,
  addedAt: Date.now(),
  status: "want" as const,
  bookmarks: [],
  offline: false,
});
export async function importBook(file: File, language: string): Promise<Book> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (
    !extension ||
    !["epub", "pdf", "txt"].includes(extension) ||
    file.size > 50 * 1024 * 1024 ||
    !file.size
  )
    throw new Error("Invalid file");
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (
    (extension === "pdf" &&
      new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") ||
    (extension === "epub" && (bytes[0] !== 0x50 || bytes[1] !== 0x4b))
  )
    throw new Error("Invalid file");
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  const book: Book = {
    id: `local:${hash}`,
    title: file.name.replace(/\.[^.]+$/, "").replace(/_/g, " "),
    authors: [],
    language,
    languages: [language],
    source: "local",
    sourceUrl: "",
    cover: null,
    subjects: [],
    description: "",
    access: "read",
    rights: "Personal copy imported on this device.",
    formats: [extension.toUpperCase()],
  };
  const content: BookContent =
    extension === "txt"
      ? {
          type: "text",
          text: new TextDecoder().decode(buffer),
          chapters: [],
          sourceUrl: "",
          attribution: "",
        }
      : { type: extension as "epub" | "pdf", data: buffer };
  await saveOffline(book.id, content);
  return book;
}
