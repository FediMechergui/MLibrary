export type Language = "en" | "fr" | "ar";
export type Book = {
  id: string;
  title: string;
  authors: string[];
  language: string;
  languages: string[];
  source: string;
  sourceUrl: string;
  cover: string | null;
  subjects: string[];
  description: string;
  access: "read" | "borrow" | "source";
  rights: string;
  formats: string[];
  year?: number;
  downloads?: number;
};
export type BookContent =
  | {
      type: "text";
      text: string;
      chapters: { title: string; url: string }[];
      sourceUrl: string;
      attribution: string;
    }
  | { type: "epub" | "pdf"; data: ArrayBuffer };
export type Progress = {
  position: number;
  total: number;
  percent: number;
  cfi?: string;
  offset?: number;
  updatedAt: number;
};
export type Bookmark = {
  id: string;
  position: number;
  cfi?: string;
  offset?: number;
  label: string;
  createdAt: number;
};
export type ShelfEntry = {
  book: Book;
  addedAt: number;
  status: "want" | "reading" | "finished";
  progress?: Progress;
  bookmarks: Bookmark[];
  offline: boolean;
};
export type ReaderSettings = {
  theme: "paper" | "sepia" | "night";
  mode: "flip" | "page" | "scroll";
  fontSize: number;
  lineHeight: number;
  font: "serif" | "sans";
};
export type AppState = {
  version: 1;
  language: Language;
  shelf: Record<string, ShelfEntry>;
  activity: Record<string, number>;
  dailyGoal: number;
  settings: ReaderSettings;
};
export type SearchResult = {
  books: Book[];
  sources: {
    source: string;
    count: number;
    language?: string;
    hasMore: boolean;
  }[];
  errors: { source: string; message: string }[];
  hasMore: boolean;
  page: number;
  updatedAt: string;
  stale?: boolean;
};
export type Source = {
  id: string;
  name: string;
  languages: string[];
  url: string;
  kind: string;
  description: string;
  rights: string;
};
