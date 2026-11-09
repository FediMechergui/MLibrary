import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookmarkSimple,
  BookOpen,
  CaretLeft,
  CaretRight,
  Check,
  CircleNotch,
  DownloadSimple,
  List,
  TextAa,
  X,
  ArrowUpRight,
} from "@phosphor-icons/react";
import type {
  AppState,
  Book,
  BookContent,
  Bookmark,
  Progress,
  ReaderSettings,
} from "../types";
import { translator } from "../lib/i18n";
import { loadBook } from "../lib/api";
import { localDay, newEntry, saveOffline } from "../lib/state";
import type { Book as EpubBook, Rendition } from "epubjs";
import type { PDFDocumentProxy } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
type Props = {
  book: Book;
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  onClose: () => void;
  notify: (message: string) => void;
};
export default function Reader({
  book,
  state,
  update,
  onClose,
  notify,
}: Props) {
  const t = translator(state.language),
    settings = state.settings;
  const [content, setContent] = useState<BookContent | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [panel, setPanel] = useState<"settings" | "contents" | null>(null);
  const [busy, setBusy] = useState(false);
  const [jump, setJump] = useState<Bookmark | null>(null);
  const [ready, setReady] = useState(false);
  const [position, setPosition] = useState<Progress>(
    state.shelf[book.id]?.progress || {
      position: 0,
      total: 1,
      percent: 0,
      updatedAt: Date.now(),
    },
  );
  const initial = useRef(state.shelf[book.id]?.progress);
  const navigation = useRef<{ next: () => void; prev: () => void } | null>(
    null,
  );
  const entry = state.shelf[book.id];
  const patchSettings = (patch: Partial<ReaderSettings>) =>
    update((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  const saveProgress = useCallback(
    (progress: Progress) => {
      setPosition(progress);
      setReady(true);
      update((s) => {
        const entry = s.shelf[book.id] || newEntry(book);
        return {
          ...s,
          shelf: { ...s.shelf, [book.id]: { ...entry, progress } },
        };
      });
    },
    [book, update],
  );
  useEffect(() => {
    let active = true;
    setError("");
    setContent(null);
    setReady(false);
    loadBook(book)
      .then((data) => active && setContent(data))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [book, retry]);
  useEffect(() => {
    if (!ready || error) return;
    let lastTick = Date.now(),
      activeAt = Date.now();
    const active = () => {
      activeAt = Date.now();
    };
    const tick = () => {
      const now = Date.now(),
        elapsed = Math.min(15, Math.floor((now - lastTick) / 1000));
      lastTick = now;
      if (
        document.visibilityState !== "visible" ||
        now - activeAt > 180000 ||
        elapsed <= 0
      )
        return;
      update((s) => ({
        ...s,
        activity: {
          ...s.activity,
          [localDay()]: (s.activity[localDay()] || 0) + elapsed,
        },
      }));
    };
    const visibility = () => {
      lastTick = Date.now();
      if (document.visibilityState === "visible") active();
    };
    const timer = setInterval(tick, 15000);
    ["pointerdown", "keydown", "wheel", "touchstart"].forEach((name) =>
      window.addEventListener(name, active, { passive: true }),
    );
    document.addEventListener("visibilitychange", visibility);
    return () => {
      tick();
      clearInterval(timer);
      ["pointerdown", "keydown", "wheel", "touchstart"].forEach((name) =>
        window.removeEventListener(name, active),
      );
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [ready, error, update]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      if (e.key === "Escape") {
        if (panel) setPanel(null);
        else onClose();
      }
      if (panel) return;
      if (e.key === (book.language === "ar" ? "ArrowLeft" : "ArrowRight")) {
        e.preventDefault();
        navigation.current?.next();
      }
      if (e.key === (book.language === "ar" ? "ArrowRight" : "ArrowLeft")) {
        e.preventDefault();
        navigation.current?.prev();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [panel, onClose, book.language]);
  const bookmark = () => {
    const mark: Bookmark = {
      id: crypto.randomUUID(),
      position: position.position,
      cfi: position.cfi,
      offset: position.offset,
      label: `${t("page")} ${position.position + 1}`,
      createdAt: Date.now(),
    };
    update((s) => ({
      ...s,
      shelf: {
        ...s.shelf,
        [book.id]: {
          ...s.shelf[book.id],
          bookmarks: [
            ...s.shelf[book.id].bookmarks.filter((b) =>
              b.cfi ? b.cfi !== mark.cfi : b.position !== mark.position,
            ),
            mark,
          ],
        },
      },
    }));
    notify(t("bookmarked"));
  };
  const download = async () => {
    if (!content) return;
    setBusy(true);
    try {
      await saveOffline(book.id, content);
      update((s) => ({
        ...s,
        shelf: {
          ...s.shelf,
          [book.id]: { ...s.shelf[book.id], offline: true },
        },
      }));
      notify(t("downloaded"));
    } catch {
      notify(t("downloadFailed"));
    } finally {
      setBusy(false);
    }
  };
  const finished = () => {
    update((s) => ({
      ...s,
      shelf: {
        ...s.shelf,
        [book.id]: { ...s.shelf[book.id], status: "finished" },
      },
    }));
    notify(t("completed"));
  };
  const isEnd = ready && position.percent >= 99.5;
  return (
    <div className={`reader theme-${settings.theme}`}>
      <header className="reader-topbar">
        <button
          className="icon-button"
          aria-label={t("back")}
          onClick={onClose}
        >
          <ArrowLeft size={23} />
        </button>
        <div className="reader-title">
          <strong dir="auto">{book.title}</strong>
          <span>{book.authors[0] || "MLibrary"}</span>
        </div>
        <div className="reader-actions">
          <button
            className="icon-button"
            aria-label={t("contents")}
            aria-expanded={panel === "contents"}
            onClick={() => setPanel(panel === "contents" ? null : "contents")}
          >
            <List size={23} />
          </button>
          <button
            className="icon-button"
            aria-label={t("bookmark")}
            disabled={!ready}
            onClick={bookmark}
          >
            <BookmarkSimple
              size={22}
              weight={
                entry?.bookmarks.some((b) => b.position === position.position)
                  ? "fill"
                  : "regular"
              }
            />
          </button>
          <button
            className="icon-button"
            aria-label={t("settings")}
            aria-expanded={panel === "settings"}
            onClick={() => setPanel(panel === "settings" ? null : "settings")}
          >
            <TextAa size={24} />
          </button>
        </div>
      </header>
      <div className="reader-workspace">
        {!content && !error && (
          <div className="reader-message">
            <CircleNotch className="spin" size={30} />
            <p>{t("readerLoading")}</p>
          </div>
        )}
        {error && (
          <div className="reader-message" role="alert">
            <BookOpen size={32} />
            <h2>{t("readerError")}</h2>
            <p>{error}</p>
            <button
              className="button primary"
              onClick={() => setRetry((r) => r + 1)}
            >
              {t("retry")}
            </button>
            {book.sourceUrl && (
              <a
                className="text-button"
                href={book.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("original")}
                <ArrowUpRight size={16} />
              </a>
            )}
          </div>
        )}
        {content && !error && (
          <>
            {content.type === "text" ? (
              <TextViewer
                text={content.text}
                settings={settings}
                direction={book.language === "ar" ? "rtl" : "ltr"}
                initial={initial.current}
                onProgress={saveProgress}
                navigation={navigation}
                jump={jump}
              />
            ) : content.type === "epub" ? (
              <EpubViewer
                data={content.data}
                settings={settings}
                initial={initial.current}
                onProgress={saveProgress}
                navigation={navigation}
                jump={jump}
                onError={setError}
              />
            ) : (
              <PdfViewer
                data={content.data}
                settings={settings}
                initial={initial.current}
                onProgress={saveProgress}
                navigation={navigation}
                jump={jump}
                onError={setError}
              />
            )}
          </>
        )}
        {panel && (
          <>
            <div
              className="reader-panel-scrim"
              onClick={() => setPanel(null)}
            />
            <aside
              className="reader-panel"
              role="dialog"
              aria-label={t(panel === "settings" ? "settings" : "contents")}
            >
              <div className="panel-heading">
                <h2>{t(panel === "settings" ? "settings" : "contents")}</h2>
                <button
                  className="icon-button"
                  aria-label={t("close")}
                  onClick={() => setPanel(null)}
                >
                  <X size={21} />
                </button>
              </div>
              {panel === "settings" ? (
                <>
                  <label className="setting-label">{t("theme")}</label>
                  <div className="theme-options">
                    {(["paper", "sepia", "night"] as const).map((theme) => (
                      <button
                        key={theme}
                        aria-label={t(theme)}
                        className={`theme-choice theme-${theme} ${settings.theme === theme ? "selected" : ""}`}
                        onClick={() => patchSettings({ theme })}
                      >
                        <span>Aa</span>
                        {t(theme)}
                        {settings.theme === theme && <Check size={14} />}
                      </button>
                    ))}
                  </div>
                  <label className="setting-label">{t("readingMode")}</label>
                  <div className="segmented">
                    {(["flip", "page", "scroll"] as const)
                      .filter(
                        (mode) => content?.type === "text" || mode !== "scroll",
                      )
                      .map((mode) => (
                        <button
                          key={mode}
                          className={settings.mode === mode ? "selected" : ""}
                          onClick={() => patchSettings({ mode })}
                        >
                          {t(mode === "page" ? "paged" : mode)}
                        </button>
                      ))}
                  </div>
                  {content?.type !== "pdf" && (
                    <>
                      <label className="setting-label" htmlFor="font-size">
                        {t("textSize")}
                        <span>{settings.fontSize}px</span>
                      </label>
                      <input
                        id="font-size"
                        type="range"
                        min="14"
                        max="32"
                        step="1"
                        value={settings.fontSize}
                        onChange={(e) =>
                          patchSettings({ fontSize: Number(e.target.value) })
                        }
                      />
                      <label className="setting-label" htmlFor="line-spacing">
                        {t("lineSpacing")}
                        <span>{settings.lineHeight.toFixed(1)}</span>
                      </label>
                      <input
                        id="line-spacing"
                        type="range"
                        min="1.4"
                        max="2.2"
                        step="0.1"
                        value={settings.lineHeight}
                        onChange={(e) =>
                          patchSettings({ lineHeight: Number(e.target.value) })
                        }
                      />
                      <label className="setting-label">{t("typeface")}</label>
                      <div className="segmented">
                        {(["serif", "sans"] as const).map((font) => (
                          <button
                            key={font}
                            className={settings.font === font ? "selected" : ""}
                            onClick={() => patchSettings({ font })}
                          >
                            {t(font)}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {content?.type !== "text" && (
                    <p className="panel-note">
                      {t(content?.type === "epub" ? "epubHint" : "pdfHint")}
                    </p>
                  )}
                  <div className="panel-divider" />
                  <button
                    className="button secondary download-button"
                    disabled={!content || busy || entry?.offline}
                    onClick={download}
                  >
                    {busy ? (
                      <CircleNotch size={18} className="spin" />
                    ) : entry?.offline ? (
                      <Check size={18} />
                    ) : (
                      <DownloadSimple size={18} />
                    )}{" "}
                    {t(entry?.offline ? "downloaded" : "download")}
                  </button>
                </>
              ) : (
                <>
                  <label className="setting-label">{t("bookmarks")}</label>
                  {entry?.bookmarks.length ? (
                    entry.bookmarks.map((mark) => (
                      <div className="bookmark-row" key={mark.id}>
                        <button
                          onClick={() => {
                            setJump({ ...mark });
                            setPanel(null);
                          }}
                        >
                          <BookmarkSimple size={17} />
                          {mark.label}
                          <small>
                            {new Date(mark.createdAt).toLocaleDateString(
                              state.language,
                            )}
                          </small>
                        </button>
                        <button
                          className="icon-button"
                          aria-label={t("remove")}
                          onClick={() =>
                            update((s) => ({
                              ...s,
                              shelf: {
                                ...s.shelf,
                                [book.id]: {
                                  ...s.shelf[book.id],
                                  bookmarks: s.shelf[book.id].bookmarks.filter(
                                    (b) => b.id !== mark.id,
                                  ),
                                },
                              },
                            }))
                          }
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="panel-note">{t("noBookmarks")}</p>
                  )}
                  {content?.type === "text" && content.chapters.length > 0 && (
                    <>
                      <label className="setting-label">{t("original")}</label>
                      <p className="panel-note">{t("chaptersNote")}</p>
                      {content.chapters.map((ch) => (
                        <a
                          className="chapter-link"
                          key={ch.url}
                          href={ch.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          dir="auto"
                        >
                          {ch.title}
                          <ArrowUpRight size={15} />
                        </a>
                      ))}
                    </>
                  )}
                  <div className="panel-divider" />
                  <label className="setting-label">{t("attribution")}</label>
                  <p className="panel-note">
                    {content?.type === "text"
                      ? content.attribution
                      : book.rights}
                  </p>
                  {book.sourceUrl && (
                    <a
                      className="text-button"
                      href={book.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t("original")}
                      <ArrowUpRight size={16} />
                    </a>
                  )}
                </>
              )}
            </aside>
          </>
        )}
      </div>
      <footer className="reader-footer">
        <div className="reader-progress-line">
          <i style={{ width: `${position.percent}%` }} />
        </div>
        <button
          className="icon-button"
          aria-label={t("previous")}
          disabled={
            !ready ||
            (content?.type === "epub"
              ? position.percent <= 0
              : position.position <= 0)
          }
          onClick={() => navigation.current?.prev()}
        >
          <CaretLeft size={24} />
        </button>
        <div className="page-indicator">
          <span>
            {t("page")} {position.position + 1} {t("of")} {position.total}
          </span>
          <small>{Math.round(position.percent)}%</small>
        </div>
        {isEnd && entry?.status !== "finished" ? (
          <button className="finish-button" onClick={finished}>
            <Check size={17} />
            {t("complete")}
          </button>
        ) : (
          <button
            className="icon-button"
            aria-label={t("next")}
            disabled={!ready || isEnd}
            onClick={() => navigation.current?.next()}
          >
            <CaretRight size={24} />
          </button>
        )}
      </footer>
    </div>
  );
}

type ViewerProps = {
  settings: ReaderSettings;
  initial?: Progress;
  onProgress: (p: Progress) => void;
  navigation: React.RefObject<{ next: () => void; prev: () => void } | null>;
  jump: Bookmark | null;
};
type Page = { text: string; offset: number };
function paginate(
  text: string,
  width: number,
  height: number,
  settings: ReaderSettings,
  direction: string,
): Page[] {
  const canvas = document.createElement("canvas"),
    context = canvas.getContext("2d")!;
  const family =
    direction === "rtl"
      ? "Noto Naskh Arabic"
      : settings.font === "serif"
        ? "Newsreader"
        : "DM Sans";
  context.font = `${settings.fontSize}px "${family}"`;
  const linesPerPage = Math.max(
    3,
    Math.floor((height - 24) / (settings.fontSize * settings.lineHeight)),
  );
  const tokens = text.match(/[^\S\n]+|\n|\S+/g) || [""];
  const pages: Page[] = [];
  let lineWidth = 0,
    lines = 1,
    start = 0,
    offset = 0,
    pageText = "";
  for (const token of tokens) {
    const tokenWidth = token === "\n" ? 0 : context.measureText(token).width;
    const newLines =
      token === "\n"
        ? 1
        : Math.max(
            0,
            Math.ceil((lineWidth + tokenWidth) / Math.max(80, width)) - 1,
          );
    if (lines + newLines > linesPerPage && pageText) {
      pages.push({ text: pageText, offset: start });
      pageText = "";
      start = offset;
      lines = 1;
      lineWidth = 0;
    }
    if (token === "\n") {
      lines++;
      lineWidth = 0;
    } else if (lineWidth + tokenWidth > width) {
      lines += Math.max(1, Math.ceil(tokenWidth / width));
      lineWidth = tokenWidth % width;
    } else lineWidth += tokenWidth;
    pageText += token;
    offset += token.length;
  }
  if (pageText || !pages.length) pages.push({ text: pageText, offset: start });
  return pages;
}
function TextViewer({
  text,
  settings,
  direction,
  initial,
  onProgress,
  navigation,
  jump,
}: ViewerProps & { text: string; direction: "rtl" | "ltr" }) {
  const root = useRef<HTMLDivElement>(null);
  const offset = useRef(initial?.offset || 0);
  const [dimensions, setDimensions] = useState({ width: 600, height: 650 });
  const [index, setIndex] = useState(initial?.position || 0);
  const [turn, setTurn] = useState("next");
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    document.fonts.ready.then(() => setFontsReady(true));
  }, []);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const style = getComputedStyle(el);
      const next = {
        width:
          el.clientWidth -
          parseFloat(style.paddingLeft) -
          parseFloat(style.paddingRight),
        height:
          el.clientHeight -
          parseFloat(style.paddingTop) -
          parseFloat(style.paddingBottom),
      };
      setDimensions((previous) =>
        previous.width === next.width && previous.height === next.height
          ? previous
          : next,
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const pages = useMemo(
    () =>
      paginate(text, dimensions.width, dimensions.height, settings, direction),
    [
      text,
      dimensions,
      settings.fontSize,
      settings.lineHeight,
      settings.font,
      direction,
      fontsReady,
    ],
  );
  const indexFor = (value: number) => {
    const i = pages.findIndex(
      (p, n) =>
        p.offset <= value && (!pages[n + 1] || pages[n + 1].offset > value),
    );
    return Math.max(0, i);
  };
  useEffect(() => {
    setIndex(indexFor(offset.current));
  }, [pages]);
  const safeIndex = Math.min(index, pages.length - 1);
  useEffect(() => {
    if (!fontsReady) return;
    offset.current = pages[safeIndex].offset;
    onProgress({
      position: safeIndex,
      total: pages.length,
      percent:
        pages.length === 1 ? 100 : (safeIndex / (pages.length - 1)) * 100,
      offset: offset.current,
      updatedAt: Date.now(),
    });
  }, [safeIndex, pages, onProgress, fontsReady]);
  const go = useCallback(
    (next: number) => {
      const value = Math.max(0, Math.min(pages.length - 1, next));
      // Keep a navigation intent through a concurrent font/viewport reflow.
      offset.current = pages[value].offset;
      setTurn(value > index ? "next" : "prev");
      setIndex(value);
      if (settings.mode === "scroll")
        root.current
          ?.querySelector(`[data-page="${value}"]`)
          ?.scrollIntoView({ block: "start", behavior: "smooth" });
      else root.current?.scrollTo(0, 0);
    },
    [index, pages, settings.mode],
  );
  useLayoutEffect(() => {
    navigation.current = {
      next: () => go(index + 1),
      prev: () => go(index - 1),
    };
  }, [go, index, navigation]);
  useEffect(() => {
    if (jump)
      go(jump.offset !== undefined ? indexFor(jump.offset) : jump.position);
  }, [jump]);
  useEffect(() => {
    if (settings.mode !== "scroll" || !root.current) return;
    const el = root.current;
    const observer = new IntersectionObserver(
      (items) => {
        const visible = items.filter((i) => i.isIntersecting);
        if (visible.length)
          setIndex(Number(visible[0].target.getAttribute("data-page")));
      },
      { root: el, rootMargin: "-10% 0px -70% 0px", threshold: 0 },
    );
    el.querySelectorAll("[data-page]").forEach((p) => observer.observe(p));
    el.querySelector(`[data-page="${safeIndex}"]`)?.scrollIntoView({
      block: "start",
    });
    return () => observer.disconnect();
  }, [settings.mode, pages]);
  const touch = useRef({ x: 0, y: 0 });
  return (
    <div
      ref={root}
      className={`text-reader mode-${settings.mode} font-${settings.font}`}
      dir={direction}
      style={{ fontSize: settings.fontSize, lineHeight: settings.lineHeight }}
      onTouchStart={(e) => {
        touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0].clientX - touch.current.x,
          dy = e.changedTouches[0].clientY - touch.current.y;
        if (
          settings.mode !== "scroll" &&
          Math.abs(dx) > 70 &&
          Math.abs(dx) > Math.abs(dy) * 1.5
        )
          go(index + (dx < 0 !== (direction === "rtl") ? 1 : -1));
      }}
    >
      {settings.mode === "scroll" ? (
        pages.map((page, i) => (
          <section
            data-page={i}
            key={page.offset}
            className="text-page scroll-page"
          >
            <div>{page.text}</div>
            <small>{i + 1}</small>
          </section>
        ))
      ) : (
        <article
          className={`text-page ${settings.mode === "flip" ? `flip-page turn-${turn}` : ""}`}
          key={`${safeIndex}-${pages.length}`}
        >
          <div>{pages[safeIndex].text}</div>
        </article>
      )}
    </div>
  );
}

function EpubViewer({
  data,
  settings,
  initial,
  onProgress,
  navigation,
  jump,
  onError,
}: ViewerProps & { data: ArrayBuffer; onError: (s: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const bookRef = useRef<EpubBook | null>(null);
  const rendition = useRef<Rendition | null>(null);
  const currentSettings = useRef(settings);
  currentSettings.current = settings;
  const applyTheme = useCallback(() => {
    const s = currentSettings.current;
    const colors =
      s.theme === "night"
        ? ["#202521", "#e2e3da"]
        : s.theme === "sepia"
          ? ["#f1e7d3", "#493c2b"]
          : ["#fbfaf6", "#30352f"];
    rendition.current?.themes.default({
      body: {
        background: `${colors[0]} !important`,
        color: `${colors[1]} !important`,
        "font-family": `${s.font === "serif" ? "Georgia, serif" : "Arial, sans-serif"} !important`,
        "line-height": `${s.lineHeight} !important`,
      },
      a: { color: "inherit !important" },
    });
    rendition.current?.themes.fontSize(`${s.fontSize}px`);
  }, []);
  useEffect(() => {
    let active = true;
    let resize: ResizeObserver | undefined;
    (async () => {
      try {
        const { default: ePub } = await import("epubjs");
        if (!active || !container.current) return;
        const book = ePub(data.slice(0));
        bookRef.current = book;
        const size = () => {
          const el = container.current!;
          const css = getComputedStyle(el);
          return {
            width:
              el.clientWidth -
              parseFloat(css.paddingLeft) -
              parseFloat(css.paddingRight),
            height:
              el.clientHeight -
              parseFloat(css.paddingTop) -
              parseFloat(css.paddingBottom),
          };
        };
        let lastSize = size();
        const view = book.renderTo(container.current, {
          ...lastSize,
          flow: "paginated",
          spread: "none",
          allowScriptedContent: false,
        });
        rendition.current = view;
        view.on(
          "relocated",
          (loc: {
            start: {
              cfi: string;
              index: number;
              displayed: { page: number; total: number };
            };
            atEnd: boolean;
          }) => {
            if (!active) return;
            const length =
              (book.spine as unknown as { length: number }).length || 1;
            const fraction =
              (loc.start.index +
                (loc.start.displayed.page - 1) /
                  Math.max(1, loc.start.displayed.total)) /
              length;
            onProgress({
              position: loc.start.displayed.page - 1,
              total: loc.start.displayed.total,
              cfi: loc.start.cfi,
              percent: loc.atEnd ? 100 : Math.min(99, fraction * 100),
              updatedAt: Date.now(),
            });
          },
        );
        // Imported EPUBs are untrusted: iframe scripting remains disabled.
        navigation.current = {
          next: () => {
            void view.next();
          },
          prev: () => {
            void view.prev();
          },
        };
        await book.ready;
        if (!active) return;
        applyTheme();
        await view.display(initial?.cfi);
        if (!active) return;
        resize = new ResizeObserver(() => {
          if (!container.current) return;
          const nextSize = size();
          if (
            nextSize.width === lastSize.width &&
            nextSize.height === lastSize.height
          )
            return;
          lastSize = nextSize;
          view.resize(nextSize.width, nextSize.height);
        });
        resize.observe(container.current);
      } catch (e) {
        if (active)
          onError(
            e instanceof Error ? e.message : "The EPUB could not be opened.",
          );
      }
    })();
    return () => {
      active = false;
      resize?.disconnect();
      rendition.current?.destroy();
      bookRef.current?.destroy();
      rendition.current = null;
    };
  }, [data]);
  useEffect(() => {
    applyTheme();
  }, [
    settings.theme,
    settings.fontSize,
    settings.lineHeight,
    settings.font,
    applyTheme,
  ]);
  useEffect(() => {
    if (jump?.cfi) void rendition.current?.display(jump.cfi);
  }, [jump]);
  return <div className="epub-reader" ref={container} />;
}

function PdfViewer({
  data,
  settings,
  initial,
  onProgress,
  navigation,
  jump,
  onError,
}: ViewerProps & { data: ArrayBuffer; onError: (s: string) => void }) {
  const root = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null),
    [index, setIndex] = useState(initial?.position || 0),
    [width, setWidth] = useState(700);
  useEffect(() => {
    let active = true;
    let task: { destroy: () => Promise<void> } | undefined;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        const loading = pdfjs.getDocument({
          data: data.slice(0),
          useSystemFonts: true,
        });
        task = loading;
        const document = await loading.promise;
        if (active) setPdf(document);
      } catch (e) {
        if (active)
          onError(
            e instanceof Error ? e.message : "The PDF could not be opened.",
          );
      }
    })();
    return () => {
      active = false;
      void task?.destroy();
    };
  }, [data]);
  useEffect(() => {
    if (!root.current) return;
    const observer = new ResizeObserver(() =>
      setWidth(root.current!.clientWidth - 32),
    );
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!pdf || !canvas.current) return;
    let active = true;
    let render: { cancel: () => void } | undefined;
    (async () => {
      try {
        const page = await pdf.getPage(Math.min(index + 1, pdf.numPages));
        if (!active || !canvas.current) return;
        const viewport = page.getViewport({
          scale: Math.min(2, width / page.getViewport({ scale: 1 }).width),
        });
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const el = canvas.current;
        el.width = viewport.width * ratio;
        el.height = viewport.height * ratio;
        el.style.width = `${viewport.width}px`;
        el.style.height = `${viewport.height}px`;
        const task = page.render({
          canvas: el,
          viewport,
          transform: [ratio, 0, 0, ratio, 0, 0],
        });
        render = task;
        await task.promise;
        if (active)
          onProgress({
            position: index,
            total: pdf.numPages,
            percent:
              pdf.numPages === 1 ? 100 : (index / (pdf.numPages - 1)) * 100,
            updatedAt: Date.now(),
          });
      } catch (e) {
        if (
          active &&
          !(e instanceof Error && e.name === "RenderingCancelledException")
        )
          onError(
            e instanceof Error ? e.message : "Could not display the PDF page.",
          );
      }
    })();
    return () => {
      active = false;
      render?.cancel();
    };
  }, [pdf, index, width, onProgress, onError]);
  useEffect(() => {
    navigation.current = {
      next: () => {
        setIndex((i) => Math.min((pdf?.numPages || 1) - 1, i + 1));
        root.current?.scrollTo(0, 0);
      },
      prev: () => {
        setIndex((i) => Math.max(0, i - 1));
        root.current?.scrollTo(0, 0);
      },
    };
  }, [pdf, navigation]);
  useEffect(() => {
    if (jump) setIndex(jump.position);
  }, [jump]);
  return (
    <div ref={root} className="pdf-reader">
      <canvas
        ref={canvas}
        key={index}
        className={settings.mode === "flip" ? "flip-page" : ""}
        aria-label={`PDF page ${index + 1}`}
      />
    </div>
  );
}
