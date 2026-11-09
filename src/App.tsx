import {
  useCallback,
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
import type { ReactNode } from "react";
import {
  Books,
  Compass,
  ChartLineUp,
  GlobeHemisphereWest,
  MagnifyingGlass,
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  BookmarkSimple,
  X,
  Plus,
  BookOpen,
  DownloadSimple,
  Check,
  Flame,
  Clock,
  Trophy,
  Sparkle,
  UploadSimple,
  WifiSlash,
  CaretDown,
  CircleNotch,
  Quotes,
  SlidersHorizontal,
} from "@phosphor-icons/react";
import type {
  AppState,
  Book,
  Language,
  ReadingMark,
  SearchResult,
  Source,
} from "./types";
import { translator, languageNames } from "./lib/i18n";
import type { MessageKey } from "./lib/i18n";
import {
  currentStreak,
  deleteOffline,
  importBook,
  localDay,
  newEntry,
  useLibraryState,
} from "./lib/state";
import { getSources, getSyncStatus, searchBooks } from "./lib/api";
import { BookCover } from "./components/BookCover";
import { MyQuotes, ReadingPreferences } from "./components/ReadingNotes";
import { SourcePanel } from "./components/SourceReader";
import { readerText } from "./lib/reader-i18n";
import { normalizeTags } from "./lib/annotations";
const Reader = lazy(() => import("./components/Reader"));
type Tab = "discover" | "library" | "quotes" | "journey" | "sources";
const sourceNames: Record<string, string> = {
  gutenberg: "Project Gutenberg",
  wikisource: "Wikisource",
  openlibrary: "Open Library",
  archive: "Internet Archive",
  local: "MLibrary",
};
const genreKeys: MessageKey[] = [
  "allBooks",
  "fiction",
  "philosophy",
  "history",
  "poetry",
  "science",
];
export default function App() {
  const [state, update] = useLibraryState();
  const t = translator(state.language);
  const r = readerText(state.language);
  const [initialMark, setInitialMark] = useState<ReadingMark>();
  const [sourceView, setSourceView] = useState("");
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [shelfTag, setShelfTag] = useState("");
  const [tab, setTab] = useState<Tab>("discover");
  const [featured, setFeatured] = useState<Book[]>([]);
  const [detail, setDetail] = useState<Book | null>(null);
  const [reading, setReading] = useState<Book | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [bookLanguage, setBookLanguage] = useState("all");
  const [source, setSource] = useState("all");
  const [genre, setGenre] = useState<MessageKey>("allBooks");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [toast, setToast] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [shelfTab, setShelfTab] = useState("all");
  const [sourceList, setSourceList] = useState<Source[]>([]);
  const [sync, setSync] = useState<{
    status: string;
    records: number;
    lastSuccess?: string;
  } | null>(null);
  const [remove, setRemove] = useState<Book | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const notify = useCallback((text: string) => setToast(text), []);
  const isBrowse =
    !search &&
    bookLanguage === "all" &&
    source === "all" &&
    genre === "allBooks";
  const goTab = (next: Tab) => {
    setTab(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  useEffect(() => {
    document.documentElement.lang = state.language;
    document.documentElement.dir = state.language === "ar" ? "rtl" : "ltr";
  }, [state.language]);
  useEffect(() => {
    fetch("/data/featured.json")
      .then((r) => r.json())
      .then((data) => setFeatured(data.books))
      .catch(() => {});
  }, []);
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    const storage = () => notify(t("storageError"));
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    window.addEventListener("mlibrary-storage-error", storage);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
      window.removeEventListener("mlibrary-storage-error", storage);
    };
  }, [state.language, notify]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  useEffect(() => {
    if (isBrowse && page === 1) {
      setResult(null);
      setError("");
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const timer = setTimeout(
      () =>
        searchBooks(
          {
            q: search || (genre === "allBooks" ? "" : genre),
            language: bookLanguage,
            source,
            page,
          },
          controller.signal,
        )
          .then((data) => {
            if (controller.signal.aborted) return;
            setResult((previous) =>
              page > 1
                ? {
                    ...data,
                    books: [
                      ...new Map(
                        [...(previous?.books || []), ...data.books].map((b) => [
                          b.id,
                          b,
                        ]),
                      ).values(),
                    ],
                  }
                : data,
            );
          })
          .catch((e) => {
            if (!controller.signal.aborted) setError(e.message);
          })
          .finally(() => {
            if (!controller.signal.aborted) setLoading(false);
          }),
      150,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, bookLanguage, source, genre, page, refresh, isBrowse]);
  useEffect(() => {
    if (tab !== "sources") return;
    let active = true;
    setError("");
    getSources()
      .then((data) => active && setSourceList(data.sources))
      .catch((e) => active && setError(e.message));
    getSyncStatus()
      .then((data) => active && setSync(data))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [tab, refresh]);
  useEffect(() => {
    if (!window.Capacitor?.isNativePlatform()) return;
    let removeListener: (() => void) | undefined;
    import("@capacitor/app").then(async ({ App }) => {
      const listener = await App.addListener("backButton", () => {
        if (sourceView) setSourceView("");
        else if (preferencesOpen) setPreferencesOpen(false);
        else if (reading) setReading(null);
        else if (detail) setDetail(null);
        else if (tab !== "discover") setTab("discover");
        else App.minimizeApp();
      });
      removeListener = () => listener.remove();
    });
    return () => removeListener?.();
  }, [reading, detail, tab, sourceView, preferencesOpen]);

  const saveBook = (book: Book) => {
    update((s) =>
      s.shelf[book.id]
        ? s
        : { ...s, shelf: { ...s.shelf, [book.id]: newEntry(book) } },
    );
    notify(t("savedToast"));
  };
  const openBook = (book: Book, mark?: ReadingMark) => {
    update((s) => ({
      ...s,
      shelf: {
        ...s.shelf,
        [book.id]: {
          ...(s.shelf[book.id] || newEntry(book)),
          status:
            s.shelf[book.id]?.status === "finished" ? "finished" : "reading",
        },
      },
    }));
    setDetail(null);
    setInitialMark(mark);
    setReading(book);
  };
  const changeFilter = (fn: () => void) => {
    fn();
    setPage(1);
    setResult(null);
  };
  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    changeFilter(() => {
      setSearch(query.trim());
      setGenre("allBooks");
    });
    setTab("discover");
  };
  const handleImport = async (file?: File, read = false) => {
    if (!file) return;
    try {
      const book = await importBook(file, state.language);
      update((s) => ({
        ...s,
        shelf: {
          ...s.shelf,
          [book.id]: { ...(s.shelf[book.id] || newEntry(book)), offline: true },
        },
      }));
      notify(t("imported"));
      if (read) openBook(book);
      else setDetail(book);
    } catch {
      notify(t("importError"));
    } finally {
      if (input.current) input.current.value = "";
    }
  };
  const deleteBook = async () => {
    if (!remove) return;
    await deleteOffline(remove.id);
    update((s) => {
      const shelf = { ...s.shelf };
      delete shelf[remove.id];
      return { ...s, shelf };
    });
    setRemove(null);
    setDetail(null);
  };
  const entries = Object.values(state.shelf).sort(
    (a, b) =>
      (b.progress?.updatedAt || b.addedAt) -
      (a.progress?.updatedAt || a.addedAt),
  );
  const continueBook = entries.find(
    (e) => e.status === "reading" && e.progress,
  );
  const todayMinutes = Math.floor((state.activity[localDay()] || 0) / 60);
  const preferenceScore = (book: Book) => {
    const subjects = book.subjects.join(" ").toLowerCase();
    const purposes: Record<string, string[]> = {
      escape: ["fiction", "adventure", "fantasy"],
      learn: ["science", "history", "biography"],
      reflect: ["poetry", "philosophy"],
      research: ["science", "history", "philosophy"],
    };
    const interests = [
      ...state.preferences.genres.map((v) => v.toLowerCase()),
      ...state.preferences.purposes.flatMap((p) => purposes[p] || []),
    ];
    return (
      interests.filter((genre) => subjects.includes(genre)).length * 3 +
      (state.preferences.languages.includes(book.language as Language) ? 1 : 0)
    );
  };
  const displayed =
    result?.books ||
    (isBrowse
      ? [...featured].sort((a, b) => preferenceScore(b) - preferenceScore(a))
      : []);
  const shelf = entries.filter(
    (e) =>
      (!shelfTag || e.tags?.includes(shelfTag)) &&
      (shelfTab === "all" ||
        (shelfTab === "offline" ? e.offline : e.status === shelfTab)),
  );

  const renderCard = (book: Book) => (
    <article className="book-card" key={book.id}>
      <button
        className="book-open"
        onClick={() => setDetail(book)}
        aria-label={book.title}
      >
        <BookCover book={book} />
        <span className="book-language">
          {languageNames[book.language] || book.language}
        </span>
      </button>
      <div className="book-card-info">
        <button
          className="title-button"
          onClick={() => setDetail(book)}
          dir="auto"
        >
          <h3>{book.title}</h3>
        </button>
        <p dir="auto">
          {book.authors[0]?.replace(/^([^,]+), (.+)$/, "$2 $1") ||
            t("unknownAuthor")}
        </p>
        <div className="book-meta">
          <span>
            {book.access === "read" ? (
              <>
                <span className="status-dot" />
                {t("readable")}
              </>
            ) : book.formats.includes("SCAN") ? (
              t("scan")
            ) : (
              sourceNames[book.source]
            )}
          </span>
          <button
            className={`icon-button save-button ${state.shelf[book.id] ? "is-saved" : ""}`}
            aria-label={state.shelf[book.id] ? t("saved") : t("save")}
            onClick={() =>
              state.shelf[book.id] ? setDetail(book) : saveBook(book)
            }
          >
            <BookmarkSimple
              size={19}
              weight={state.shelf[book.id] ? "fill" : "regular"}
            />
          </button>
        </div>
      </div>
      {state.shelf[book.id]?.progress && (
        <div className="book-progress">
          <i style={{ width: `${state.shelf[book.id].progress!.percent}%` }} />
        </div>
      )}
    </article>
  );

  if (reading)
    return (
      <Suspense
        fallback={
          <div className="full-loading">
            <CircleNotch className="spin" size={30} />
            {t("readerLoading")}
          </div>
        }
      >
        <Reader
          key={reading.id}
          book={reading}
          initialMark={initialMark}
          onImport={(file) => void handleImport(file, true)}
          onFindEdition={() => {
            setReading(null);
            setQuery(reading.title);
            changeFilter(() => {
              setSearch(reading.title);
              setBookLanguage(reading.language || "all");
              setSource("all");
              setGenre("allBooks");
            });
            goTab("discover");
          }}
          state={state}
          update={update}
          onClose={() => setReading(null)}
          notify={notify}
        />
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </Suspense>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            goTab("discover");
          }}
        >
          <img src="/icon.svg" alt="" />
          <span>
            MLibrary<span className="brand-dot">.</span>
          </span>
        </a>
        <p className="sidebar-caption">{t("tagline")}</p>
        <nav aria-label="Main">
          {(
            [
              { key: "discover", Icon: Compass },
              { key: "library", Icon: Books },
              { key: "quotes", Icon: Quotes },
              { key: "journey", Icon: ChartLineUp },
              { key: "sources", Icon: GlobeHemisphereWest },
            ] as const
          ).map(({ key, Icon }) => (
            <button
              key={key}
              className={`nav-item ${tab === key ? "active" : ""}`}
              onClick={() => goTab(key)}
              aria-current={tab === key ? "page" : undefined}
            >
              <Icon size={22} weight={tab === key ? "fill" : "regular"} />
              <span>{key === "quotes" ? r("quotes") : t(key)}</span>
              {key === "library" && entries.length > 0 && (
                <small>{entries.length}</small>
              )}
              {key === "quotes" &&
                Object.values(state.marks).some((m) => m.quoted) && (
                  <small>
                    {Object.values(state.marks).filter((m) => m.quoted).length}
                  </small>
                )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-goal">
            <BookOpen size={26} weight="duotone" />
            <strong>{t("goal")}</strong>
            <p>{t("goalCopy")}</p>
            <div className="goal-track">
              <i
                style={{
                  width: `${Math.min(100, (todayMinutes / state.dailyGoal) * 100)}%`,
                }}
              />
            </div>
            <div className="goal-caption">
              <b>
                {todayMinutes} / {state.dailyGoal} {t("min")}
              </b>
              <span>{t("today")}</span>
            </div>
          </div>
          <span className="device-label">
            <span className="status-dot" />
            {t("localOnly")}
          </span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="breadcrumb">
            <img className="mobile-brand-mark" src="/icon.svg" alt="MLibrary" />
            {tab === "quotes" ? r("quotes") : t(tab)}
          </span>
          <form className="header-search" onSubmit={submitSearch}>
            <MagnifyingGlass size={20} />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("search")}
              aria-label={t("searchLabel")}
            />
            {query && (
              <button
                type="button"
                className="icon-button"
                aria-label={t("close")}
                onClick={() => {
                  setQuery("");
                  changeFilter(() => setSearch(""));
                }}
              >
                <X size={16} />
              </button>
            )}
            <button
              className="search-submit"
              type="submit"
              aria-label={t("searchLabel")}
            >
              <ArrowRight size={17} />
            </button>
          </form>
          <div className="language-select">
            <GlobeHemisphereWest size={19} />
            <select
              aria-label={t("language")}
              value={state.language}
              onChange={(e) =>
                update((s) => ({ ...s, language: e.target.value as Language }))
              }
            >
              <option value="en">English</option>
              <option value="fr">Français</option>
              <option value="ar">العربية</option>
            </select>
            <CaretDown size={12} />
          </div>
        </header>
        {!online && (
          <div className="connection-banner" role="status">
            <WifiSlash size={18} />
            {t("offlineNotice")}
            <button onClick={() => goTab("library")}>{t("library")}</button>
          </div>
        )}
        <main>
          {tab === "quotes" && (
            <MyQuotes
              state={state}
              update={update}
              notify={notify}
              onRead={openBook}
            />
          )}
          {tab === "discover" && (
            <>
              {isBrowse && (
                <section className="hero">
                  <div className="hero-copy">
                    <span className="eyebrow">
                      <span className="small-line" />
                      {t("welcome")}
                    </span>
                    <h1>
                      {t("heroTitle")
                        .split("\n")
                        .map((line, i) => (
                          <span key={i}>{line}</span>
                        ))}
                    </h1>
                    <p>{t("heroCopy")}</p>
                    <button
                      className="button primary"
                      onClick={() =>
                        document
                          .getElementById("catalogue")
                          ?.scrollIntoView({ behavior: "smooth" })
                      }
                    >
                      {t("explore")}
                      <ArrowRight size={19} />
                    </button>
                    <div className="hero-languages">
                      <span>English</span>
                      <i />
                      <span>Français</span>
                      <i />
                      <span lang="ar">العربية</span>
                    </div>
                    <button
                      className="text-button preference-link"
                      onClick={() => setPreferencesOpen(true)}
                    >
                      <SlidersHorizontal size={17} />
                      {r("preferences")}
                    </button>
                  </div>
                  <div className="hero-art">
                    <div className="hero-art-caption">
                      <span>{t("openShelf")}</span>
                      <Sparkle size={22} />
                    </div>
                    <div className="hero-books">
                      {[1342, 11, 1184].map((id, i) => {
                        const book =
                          featured.find((b) => b.id === `gutenberg:${id}`) ||
                          featured[i];
                        return book ? (
                          <button
                            key={id}
                            className={`hero-book hero-book-${i}`}
                            onClick={() => setDetail(book)}
                            aria-label={book.title}
                          >
                            <BookCover book={book} large />
                          </button>
                        ) : (
                          <div
                            key={id}
                            className={`hero-book hero-book-${i} cover-skeleton`}
                          />
                        );
                      })}
                    </div>
                    <div className="hero-art-footer">
                      <span>{t("openShelfCopy")}</span>
                      <span>01 — 03</span>
                    </div>
                  </div>
                </section>
              )}
              {isBrowse && (
                <section className="reading-strip">
                  {continueBook ? (
                    <>
                      <div className="strip-icon">
                        <BookOpen size={25} />
                      </div>
                      <div>
                        <span className="eyebrow">{t("readingNow")}</span>
                        <strong dir="auto">{continueBook.book.title}</strong>
                      </div>
                      <div className="strip-progress">
                        <span>
                          {Math.round(continueBook.progress!.percent)}%
                        </span>
                        <div className="goal-track">
                          <i
                            style={{
                              width: `${continueBook.progress!.percent}%`,
                            }}
                          />
                        </div>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => openBook(continueBook.book)}
                      >
                        {t("resume")}
                        <ArrowRight size={17} />
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="strip-icon">
                        <BookOpen size={25} />
                      </div>
                      <div>
                        <strong>{t("newReader")}</strong>
                        <span>{t("goalCopy")}</span>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => searchRef.current?.focus()}
                      >
                        {t("start")}
                        <ArrowRight size={17} />
                      </button>
                    </>
                  )}
                </section>
              )}
              <section id="catalogue" className="catalogue-section">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">
                      {search ? t("resultsFor") : "MLIBRARY COLLECTION"}
                    </span>
                    <h2>
                      {search
                        ? `“${search}”`
                        : t(isBrowse ? "curated" : "results")}
                    </h2>
                    {isBrowse && (
                      <p>
                        {state.preferences.genres.length ||
                        state.preferences.purposes.length
                          ? r("yourInterests")
                          : t("curatedCopy")}
                      </p>
                    )}
                  </div>
                  <div className="catalogue-filters">
                    <label>
                      <GlobeHemisphereWest size={16} />
                      <select
                        aria-label={t("allLanguages")}
                        value={bookLanguage}
                        onChange={(e) =>
                          changeFilter(() => setBookLanguage(e.target.value))
                        }
                      >
                        <option value="all">{t("allLanguages")}</option>
                        {["en", "fr", "ar"].map((l) => (
                          <option key={l} value={l}>
                            {languageNames[l]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <Books size={16} />
                      <select
                        aria-label={t("allSources")}
                        value={source}
                        onChange={(e) =>
                          changeFilter(() => setSource(e.target.value))
                        }
                      >
                        <option value="all">{t("allSources")}</option>
                        {Object.entries(sourceNames)
                          .filter(([key]) => key !== "local")
                          .map(([key, name]) => (
                            <option key={key} value={key}>
                              {name}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
                </div>
                <div
                  className="genre-tabs"
                  role="group"
                  aria-label={t("allBooks")}
                >
                  {genreKeys.map((key) => (
                    <button
                      key={key}
                      className={genre === key ? "selected" : ""}
                      onClick={() =>
                        changeFilter(() => {
                          setGenre(key);
                          setSearch("");
                          setQuery("");
                        })
                      }
                    >
                      {t(key)}
                    </button>
                  ))}
                  <span className="results-count">
                    {displayed.length} {t("shown")}
                  </span>
                </div>
                {result?.errors.length ? (
                  <div className="notice" role="status">
                    {t("partial")}{" "}
                    <span>
                      {[
                        ...new Set(
                          result.errors.map((e) => sourceNames[e.source]),
                        ),
                      ].join(", ")}
                    </span>
                  </div>
                ) : null}
                {error && (
                  <div className="notice error" role="alert">
                    {error}
                    <button
                      className="text-button"
                      onClick={() => setRefresh((r) => r + 1)}
                    >
                      {t("retry")}
                    </button>
                  </div>
                )}
                {loading && page === 1 ? (
                  <div className="book-grid" aria-label={t("loading")}>
                    {Array.from({ length: 6 }, (_, i) => (
                      <div className="book-skeleton" key={i}>
                        <div />
                        <span />
                        <span />
                      </div>
                    ))}
                  </div>
                ) : displayed.length ? (
                  <div className="book-grid">{displayed.map(renderCard)}</div>
                ) : (
                  !error && (
                    <Empty
                      icon={<Books size={38} />}
                      title={t("noResults")}
                      copy={t("noResultsCopy")}
                    />
                  )
                )}
                {(isBrowse || result?.hasMore) && (
                  <div className="load-more">
                    <button
                      className="button secondary"
                      disabled={loading}
                      onClick={() => {
                        if (isBrowse)
                          changeFilter(() => setSource("gutenberg"));
                        else setPage((p) => p + 1);
                      }}
                    >
                      {loading ? (
                        <CircleNotch className="spin" size={18} />
                      ) : (
                        <Plus size={18} />
                      )}{" "}
                      {t(loading ? "loading" : "loadMore")}
                    </button>
                  </div>
                )}
                {!!result?.sources.length && (
                  <p className="source-results">
                    {result.sources
                      .map(
                        (s) =>
                          `${sourceNames[s.source]}${s.language ? ` (${s.language})` : ""}: ${s.count.toLocaleString(state.language)}`,
                      )
                      .join(" · ")}
                  </p>
                )}
              </section>
            </>
          )}
          {tab === "library" && (
            <>
              <PageHeading
                eyebrow={t("library")}
                title={t("libraryTitle")}
                copy={t("libraryCopy")}
                action={
                  <button
                    className="button primary"
                    onClick={() => input.current?.click()}
                  >
                    <UploadSimple size={18} />
                    {t("import")}
                  </button>
                }
              />
              <div className="genre-tabs library-tabs">
                {(
                  ["all", "want", "reading", "finished", "offline"] as const
                ).map((key) => (
                  <button
                    className={shelfTab === key ? "selected" : ""}
                    key={key}
                    onClick={() => setShelfTab(key)}
                  >
                    {t(key)}
                    {key === "all" && <small>{entries.length}</small>}
                  </button>
                ))}
              </div>
              {entries.some((e) => e.tags?.length) && (
                <div className="tag-filters">
                  <button
                    className={`chip ${!shelfTag ? "active" : ""}`}
                    onClick={() => setShelfTag("")}
                  >
                    {r("anyTag")}
                  </button>
                  {[...new Set(entries.flatMap((e) => e.tags || []))].map(
                    (tag) => (
                      <button
                        key={tag}
                        className={`chip ${shelfTag === tag ? "active" : ""}`}
                        onClick={() => setShelfTag(tag)}
                      >
                        #{tag}
                      </button>
                    ),
                  )}
                </div>
              )}
              {shelf.length ? (
                <div className="book-grid">
                  {shelf.map((e) => renderCard(e.book))}
                </div>
              ) : (
                <Empty
                  icon={<Books size={42} />}
                  title={t("emptyLibrary")}
                  copy={t("emptyLibraryCopy")}
                  action={
                    <button
                      className="button primary"
                      onClick={() => goTab("discover")}
                    >
                      {t("explore")}
                      <ArrowRight size={18} />
                    </button>
                  }
                />
              )}
              <p className="import-note">{t("importHint")}</p>
            </>
          )}
          {tab === "journey" && (
            <>
              <Journey state={state} update={update} />
              <ReadingPreferences state={state} update={update} />
            </>
          )}
          {tab === "sources" && (
            <>
              <PageHeading
                eyebrow={t("sources")}
                title={t("sourceTitle")}
                copy={t("sourceCopy")}
              />
              <div className="source-summary">
                <GlobeHemisphereWest size={28} />
                <p>{t("sourceNote")}</p>
              </div>
              {error && (
                <div className="notice error">
                  {error}
                  <button onClick={() => setRefresh((r) => r + 1)}>
                    {t("retry")}
                  </button>
                </div>
              )}
              <div className="source-list">
                {sourceList.map((s, i) => (
                  <article key={s.id} className="source-row">
                    <span className="source-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <span className={`source-tag ${s.kind}`}>
                        {t(
                          s.kind === "integrated"
                            ? "integrated"
                            : s.kind === "discovery"
                              ? "discovery"
                              : "directory",
                        )}
                      </span>
                      <h3>{s.name}</h3>
                      <p>{s.description}</p>
                      <small>{s.rights}</small>
                    </div>
                    <div className="source-actions">
                      <span>
                        {s.languages.map((l) => languageNames[l]).join(" · ")}
                      </span>
                      <button
                        className="text-button"
                        onClick={() => setSourceView(s.url)}
                      >
                        {t("visit")}
                        <ArrowUpRight size={19} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              <div className="sync-panel">
                <div>
                  <h3>{t("sync")}</h3>
                  <p>{t("syncCopy")}</p>
                </div>
                <span>
                  {sync?.status === "ok"
                    ? `${sync.records.toLocaleString()} ${t("synced")}`
                    : t("notSynced")}
                  {sync?.lastSuccess && (
                    <small>
                      {new Date(sync.lastSuccess).toLocaleString(
                        state.language,
                      )}
                    </small>
                  )}
                </span>
              </div>
            </>
          )}
        </main>
        <footer className="site-footer">
          <span>
            MLibrary<span className="brand-dot">.</span>
          </span>
          <p>{t("footer")}</p>
          <span>EN / FR / AR</span>
        </footer>
      </div>
      <input
        className="visually-hidden"
        type="file"
        ref={input}
        accept=".epub,.pdf,.txt"
        onChange={(e) => handleImport(e.target.files?.[0])}
      />
      {detail && (
        <Modal onClose={() => setDetail(null)} label={detail.title}>
          <div className="book-detail">
            <div className="detail-cover">
              <BookCover book={detail} large />
              <span className="detail-source">
                {sourceNames[detail.source]}
              </span>
            </div>
            <div className="detail-body">
              <span className="eyebrow">{t("about")}</span>
              <h2 dir="auto">{detail.title}</h2>
              <p className="detail-author" dir="auto">
                {detail.authors.join(" · ") || t("unknownAuthor")}
              </p>
              <div className="detail-tags">
                <span>{languageNames[detail.language] || detail.language}</span>
                {detail.formats.map((f) => (
                  <span key={f}>{f}</span>
                ))}
              </div>
              <p className="detail-description" dir="auto">
                {detail.description || t("noDescription")}
              </p>
              <div className="detail-buttons">
                <button
                  className="button primary"
                  onClick={() => openBook(detail)}
                >
                  <BookOpen size={20} />
                  {state.shelf[detail.id]?.progress
                    ? t("resume")
                    : detail.access === "read"
                      ? t("read")
                      : r("readerInside")}
                </button>
                <button
                  className="button secondary"
                  onClick={() =>
                    state.shelf[detail.id]
                      ? setRemove(detail)
                      : saveBook(detail)
                  }
                >
                  <BookmarkSimple
                    size={19}
                    weight={state.shelf[detail.id] ? "fill" : "regular"}
                  />
                  {t(state.shelf[detail.id] ? "saved" : "save")}
                </button>
              </div>
              <form
                className="book-tag-editor"
                key={detail.id}
                onSubmit={(e) => {
                  e.preventDefault();
                  const tags = normalizeTags(
                    String(new FormData(e.currentTarget).get("tags") || ""),
                  );
                  update((s) => ({
                    ...s,
                    shelf: {
                      ...s.shelf,
                      [detail.id]: {
                        ...(s.shelf[detail.id] || newEntry(detail)),
                        tags,
                      },
                    },
                  }));
                  notify(r("tagSaved"));
                }}
              >
                <label htmlFor="book-tags">{r("tagLibrary")}</label>
                <div>
                  <input
                    id="book-tags"
                    name="tags"
                    maxLength={400}
                    defaultValue={
                      state.shelf[detail.id]?.tags?.join(", ") || ""
                    }
                    placeholder={r("tagPlaceholder")}
                  />
                  <button className="button secondary" type="submit">
                    {r("done")}
                  </button>
                </div>
              </form>
              <div className="rights-note">
                <strong>{t("rights")}</strong>
                <p>{detail.rights}</p>
                {detail.sourceUrl && (
                  <button
                    className="text-button"
                    onClick={() => setSourceView(detail.sourceUrl)}
                  >
                    {t("original")}
                    <ArrowUpRight size={15} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}
      {remove && (
        <Modal label={t("confirm")} onClose={() => setRemove(null)}>
          <div className="confirm-dialog">
            <h2>{t("confirm")}</h2>
            <p>{t("deleteConfirm")}</p>
            <div className="detail-buttons">
              <button
                className="button secondary"
                onClick={() => setRemove(null)}
              >
                {t("cancel")}
              </button>
              <button className="button primary" onClick={deleteBook}>
                {t("confirm")}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {preferencesOpen && (
        <Modal
          label={r("preferences")}
          onClose={() => setPreferencesOpen(false)}
        >
          <ReadingPreferences state={state} update={update} />
        </Modal>
      )}
      {sourceView && (
        <SourcePanel
          url={sourceView}
          language={state.language}
          onClose={() => setSourceView("")}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}

function Empty({
  icon,
  title,
  copy,
  action,
}: {
  icon: ReactNode;
  title: string;
  copy: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h2>{title}</h2>
      <p>{copy}</p>
      {action}
    </div>
  );
}
function PageHeading({
  eyebrow,
  title,
  copy,
  action,
}: {
  eyebrow: string;
  title: string;
  copy: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{copy}</p>
      </div>
      {action}
    </div>
  );
}
export function Modal({
  children,
  onClose,
  label,
}: {
  children: ReactNode;
  onClose: () => void;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        closeRef.current();
      }
      if (e.key === "Tab") {
        const nodes = ref.current?.querySelectorAll<HTMLElement>(
          'button,a[href],input,select,[tabindex="0"]',
        );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        ref={ref}
        tabIndex={-1}
      >
        <button
          className="icon-button modal-close"
          aria-label="Close"
          onClick={onClose}
        >
          <X size={22} />
        </button>
        {children}
      </div>
    </div>
  );
}

function Journey({
  state,
  update,
}: {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
}) {
  const t = translator(state.language),
    streak = currentStreak(state.activity);
  const seconds = Object.values(state.activity).reduce((sum, n) => sum + n, 0);
  const completed = Object.values(state.shelf).filter(
    (e) => e.status === "finished",
  ).length;
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date();
    day.setDate(day.getDate() - (6 - index));
    return {
      date: day,
      minutes: Math.floor((state.activity[localDay(day)] || 0) / 60),
    };
  });
  // Historical streaks keep a milestone earned even after the current streak ends.
  const dates = Object.keys(state.activity)
    .filter((d) => state.activity[d] >= 60)
    .sort();
  let bestStreak = 0,
    run = 0,
    last = "";
  dates.forEach((date) => {
    const previous = new Date(`${date}T12:00:00`);
    previous.setDate(previous.getDate() - 1);
    run = localDay(previous) === last ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    last = date;
  });
  const milestones = [
    {
      icon: BookOpen,
      name: "firstRead",
      desc: "firstReadDesc",
      earned: seconds >= 60,
    },
    {
      icon: Clock,
      name: "hourRead",
      desc: "hourReadDesc",
      earned: seconds >= 3600,
    },
    {
      icon: Flame,
      name: "threeDays",
      desc: "threeDaysDesc",
      earned: bestStreak >= 3,
    },
    {
      icon: Trophy,
      name: "firstBook",
      desc: "firstBookDesc",
      earned: completed > 0,
    },
  ] as const;
  return (
    <>
      <PageHeading
        eyebrow={t("journey")}
        title={t("startJourney")}
        copy={t("journeyCopy")}
      />
      <div className="stats-grid">
        <div>
          <Flame size={26} />
          <strong>
            {streak}
            <small>{t("days")}</small>
          </strong>
          <span>{t("streak")}</span>
        </div>
        <div>
          <Books size={26} />
          <strong>{completed}</strong>
          <span>{t("booksFinished")}</span>
        </div>
        <div>
          <Clock size={26} />
          <strong>
            {Math.floor(seconds / 60)}
            <small>{t("min")}</small>
          </strong>
          <span>{t("timeRead")}</span>
        </div>
      </div>
      <div className="activity-panel">
        <div className="section-heading">
          <h2>{t("thisWeek")}</h2>
          <label className="goal-input">
            {t("dailyGoal")}
            <select
              value={state.dailyGoal}
              onChange={(e) =>
                update((s) => ({ ...s, dailyGoal: Number(e.target.value) }))
              }
            >
              {[5, 10, 15, 20, 30, 45, 60].map((n) => (
                <option key={n} value={n}>
                  {n} {t("min")}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="week-chart">
          {days.map(({ date, minutes }) => (
            <div
              className={`day-column ${localDay(date) === localDay() ? "today" : ""}`}
              key={localDay(date)}
            >
              <span>
                {minutes} <small>{t("min")}</small>
              </span>
              <div className="bar-track">
                <i
                  style={{
                    height: `${Math.max(2, (minutes / Math.max(state.dailyGoal, ...days.map((d) => d.minutes))) * 100)}%`,
                  }}
                />
              </div>
              <span>
                {date.toLocaleDateString(state.language, { weekday: "short" })}
              </span>
            </div>
          ))}
        </div>
      </div>
      <h2 className="milestones-title">{t("milestones")}</h2>
      <div className="milestone-grid">
        {milestones.map(({ icon: Icon, name, desc, earned }) => (
          <article key={name} className={`milestone ${earned ? "earned" : ""}`}>
            <div className="milestone-icon">
              <Icon size={29} weight="duotone" />
            </div>
            <span className="eyebrow">{t(earned ? "earned" : "locked")}</span>
            <h3>{t(name)}</h3>
            <p>{t(desc)}</p>
            {earned && <Check className="earned-check" size={17} />}
          </article>
        ))}
      </div>
      <button
        className="text-button export-button"
        onClick={() => {
          const blob = new Blob([JSON.stringify(state, null, 2)], {
            type: "application/json",
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `mlibrary-progress-${localDay()}.json`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}
      >
        <DownloadSimple size={18} />
        {t("export")}
      </button>
    </>
  );
}
