import { useState, useCallback } from "react";
import { get, set, del } from "idb-keyval";
import type { AppState, Book, BookContent } from "../types";
import { embeddedMetadata, imagePdf } from "./book-metadata";
import { stampChanges } from "./library-sync";
const KEY = "mlibrary:v1";
export const defaults: AppState = {
  version: 1,
  language: "en",
  shelf: {},
  activity: {},
  dailyGoal: 20,
  marks: {},
  sources: {},
  preferences: { genres: [], purposes: [], languages: ["en", "fr", "ar"] },
  settings: {
    theme: "paper",
    mode: "flip",
    fontSize: 20,
    lineHeight: 1.8,
    font: "serif",
    highlightColor: "honey",
    focus: false,
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
          marks: raw.marks && typeof raw.marks === "object" ? raw.marks : {},
          sources:
            raw.sources && typeof raw.sources === "object" ? raw.sources : {},
          preferences: { ...defaults.preferences, ...raw.preferences },
        }
      : defaults;
  } catch {
    return defaults;
  }
}
export function useLibraryState() {
  const [state, setState] = useState<AppState>(load);
  const update = useCallback(
    (fn: (previous: AppState) => AppState, preserveClocks = false) =>
      setState((previous) => {
        const next = preserveClocks
          ? fn(previous)
          : stampChanges(previous, fn(previous));
        try {
          localStorage.setItem(KEY, JSON.stringify(next));
        } catch {
          window.dispatchEvent(new Event("mlibrary-storage-error"));
          return previous;
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
  tags: [] as string[],
});
export async function importBook(
  file: File,
  language: string,
  origin?: { title?: string; sourceUrl: string },
): Promise<Book> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (
    !extension ||
    !["epub", "pdf", "txt", "png", "jpg", "jpeg", "webp"].includes(extension) ||
    file.size > 50 * 1024 * 1024 ||
    !file.size
  )
    throw new Error("Invalid file");
  let buffer = await file.arrayBuffer();
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
  const isImage = ["png", "jpg", "jpeg", "webp"].includes(extension);
  if (isImage) buffer = await imagePdf(buffer);
  const format = isImage ? "pdf" : extension;
  const metadata = await embeddedMetadata(buffer, format);
  const bookLanguage = metadata.language || language;
  const book: Book = {
    id: `local:${hash}`,
    title:
      origin?.title ||
      metadata.title ||
      file.name.replace(/\.[^.]+$/, "").replace(/_/g, " "),
    authors: metadata.authors || [],
    language: bookLanguage,
    languages: [bookLanguage],
    source: "local",
    sourceUrl: origin?.sourceUrl || "",
    cover: null,
    subjects: [],
    description: metadata.description || "",
    access: "read",
    rights: "Personal copy imported on this device.",
    formats: [format.toUpperCase()],
  };
  const content: BookContent =
    format === "txt"
      ? {
          type: "text",
          text: new TextDecoder().decode(buffer),
          chapters: [],
          sourceUrl: "",
          attribution: "",
        }
      : { type: format as "epub" | "pdf", data: buffer };
  await saveOffline(book.id, content);
  return book;
}
