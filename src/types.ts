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
      chapters: { title: string; url: string; id?: string }[];
      sourceUrl: string;
      attribution: string;
      chapter?: string;
    }
  | {
      type: "epub";
      data: ArrayBuffer;
      attribution?: string;
      sourceUrl?: string;
    }
  | {
      type: "pdf";
      data: ArrayBuffer | Blob;
      attribution?: string;
      sourceUrl?: string;
    }
  | { type: "pdf-url"; url: string; attribution?: string; sourceUrl?: string }
  | {
      type: "source";
      reason?: string;
      url: string;
      embedUrl?: string;
      available: boolean;
      message: string;
      attribution: string;
    };
export type HighlightColor = "honey" | "sage" | "rose" | "sky";
export type ReadingAnchor = {
  type: "text" | "epub" | "pdf" | "source";
  start?: number;
  end?: number;
  cfi?: string;
  page: number;
  chapter?: string;
};
export type ReadingMark = {
  id: string;
  book: Book;
  text: string;
  anchor: ReadingAnchor;
  color: HighlightColor;
  note: string;
  tags: string[];
  quoted: boolean;
  favorite: boolean;
  cardStyle: "paper" | "forest" | "clay";
  createdAt: number;
};
export type ReaderSelection = { text: string; anchor: ReadingAnchor };
export type Progress = {
  position: number;
  total: number;
  percent: number;
  cfi?: string;
  offset?: number;
  chapter?: string;
  fragment?: string;
  updatedAt: number;
};
export type Bookmark = {
  id: string;
  position: number;
  cfi?: string;
  offset?: number;
  label: string;
  createdAt: number;
  chapter?: string;
  fragment?: string;
};
export type ShelfEntry = {
  book: Book;
  addedAt: number;
  status: "want" | "reading" | "finished";
  progress?: Progress;
  bookmarks: Bookmark[];
  offline: boolean;
  tags?: string[];
};
export type ReaderSettings = {
  theme: "paper" | "sepia" | "night";
  mode: "flip" | "page" | "scroll";
  fontSize: number;
  lineHeight: number;
  font: "serif" | "sans";
  highlightColor: HighlightColor;
  focus: boolean;
};
export type AppState = {
  version: 1;
  language: Language;
  shelf: Record<string, ShelfEntry>;
  activity: Record<string, number>;
  dailyGoal: number;
  settings: ReaderSettings;
  marks: Record<string, ReadingMark>;
  preferences: { genres: string[]; purposes: string[]; languages: Language[] };
  sources: Record<string, SourcePreference>;
};
export type ReaderFormat = "auto" | "text" | "epub" | "pdf";
export type SourcePreference = {
  enabled?: boolean;
  format?: ReaderFormat;
  fallback?: string;
  language?: string;
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
  audit?: {
    status: "working" | "limited" | "blocked" | "directory";
    checkedAt: string;
    finding: string;
    solution: string;
  };
};
