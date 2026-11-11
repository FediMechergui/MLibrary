import { useEffect, useRef, useState } from "react";
import { X, DownloadSimple, ShareNetwork } from "@phosphor-icons/react";
import type { Language, QuoteDesign, ReadingMark } from "../types";
import {
  quoteBackground,
  quoteDesign,
  quoteFormats,
  quotePalettes,
  renderQuote,
} from "../lib/quote-design";
import { exportQuote } from "../lib/annotations";
import { studioText } from "../lib/studio-i18n";
export function QuotePreview({ mark }: { mark: ReadingMark }) {
  const [image, setImage] = useState("");
  useEffect(() => {
    let active = true;
    void renderQuote(mark)
      .then(({ canvas }) => {
        if (active) setImage(canvas.toDataURL("image/png"));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [mark]);
  return image ? (
    <img className="saved-quote-preview" src={image} alt={mark.text} />
  ) : (
    <blockquote dir="auto">{mark.text}</blockquote>
  );
}
export function QuoteStudio({
  mark,
  language,
  onSave,
  onClose,
}: {
  mark: ReadingMark;
  language: Language;
  onSave: (design: QuoteDesign) => void;
  onClose: () => void;
}) {
  const t = studioText(language),
    [design, setDesign] = useState(() => quoteDesign(mark)),
    [part, setPart] = useState(0),
    [total, setTotal] = useState(1),
    [preview, setPreview] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [rendering, setRendering] = useState(true),
    dialog = useRef<HTMLElement>(null);
  const patch = (value: Partial<QuoteDesign>) => {
    setDesign((d) => ({ ...d, ...value }));
    setPart(0);
    setRendering(true);
  };
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    dialog.current?.focus();
    return () => before?.focus();
  }, []);
  useEffect(() => {
    let active = true;
    setRendering(true);
    const timer = setTimeout(() => {
      void renderQuote(mark, design, part)
        .then((result) => {
          if (active) {
            setPreview(result.canvas.toDataURL("image/png"));
            setTotal(result.pages.length);
            setRendering(false);
          }
        })
        .catch(() => {
          if (active) {
            setError(t("exportError"));
            setRendering(false);
          }
        });
    }, 80);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [mark, design, part, language]);
  const output = async (share: boolean) => {
    setBusy(true);
    setError("");
    try {
      onSave(design);
      await exportQuote({ ...mark, cardDesign: design }, share, part);
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError"))
        setError(t("exportError"));
    } finally {
      setBusy(false);
    }
  };
  const slider = (
    key: "fontSize" | "lineHeight" | "padding" | "imageShade",
    label: "size" | "spacing" | "padding" | "shade",
    min: number,
    max: number,
    step: number,
  ) => (
    <label>
      {t(label)} <output>{design[key]}</output>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={design[key]}
        onChange={(e) => patch({ [key]: Number(e.target.value) })}
      />
    </label>
  );
  return (
    <div className="studio-overlay" data-reader-overlay>
      <section
        className="quote-studio"
        role="dialog"
        aria-modal="true"
        aria-label={t("studio")}
        tabIndex={-1}
        ref={dialog}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") onClose();
          if (e.key === "Tab") {
            const nodes = dialog.current?.querySelectorAll<HTMLElement>(
              "button:not(:disabled),input,select",
            );
            if (nodes?.length) {
              const first = nodes[0],
                last = nodes[nodes.length - 1];
              if (
                e.shiftKey &&
                (document.activeElement === first ||
                  document.activeElement === dialog.current)
              ) {
                e.preventDefault();
                last.focus();
              } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
              }
            }
          }
        }}
      >
        <header className="panel-heading">
          <strong>{t("studio")}</strong>
          <button
            className="icon-button"
            aria-label={t("cancel")}
            data-modal-close
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </header>
        <div className="quote-studio-grid">
          <div className="quote-preview-area" aria-busy={rendering}>
            {preview && (
              <img
                className="quote-preview"
                src={preview}
                alt={`${mark.text} — ${mark.book.title}, ${mark.book.authors.join(", ")}`}
                width={quoteFormats[design.format][0]}
                height={quoteFormats[design.format][1]}
              />
            )}
            <div className="quote-part-controls">
              <button
                className="button secondary"
                disabled={part === 0}
                onClick={() => setPart((p) => p - 1)}
              >
                {t("previous")}
              </button>
              <span>
                {part + 1} / {total}
              </span>
              <button
                className="button secondary"
                disabled={part + 1 >= total}
                onClick={() => setPart((p) => p + 1)}
              >
                {t("next")}
              </button>
            </div>
            {total > 1 && <p>{t("pagesHint")}</p>}
            {design.format === "story" && <p>{t("storyHint")}</p>}
          </div>
          <div className="quote-design-controls">
            <label>
              {t("format")}
              <select
                value={design.format}
                onChange={(e) =>
                  patch({ format: e.target.value as QuoteDesign["format"] })
                }
              >
                {Object.entries(quoteFormats).map(([key, size]) => (
                  <option key={key} value={key}>
                    {t(key as QuoteDesign["format"])} · {size.join(" × ")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("layout")}
              <select
                value={design.layout}
                onChange={(e) =>
                  patch({ layout: e.target.value as QuoteDesign["layout"] })
                }
              >
                {(["editorial", "centered", "minimal", "poster"] as const).map(
                  (key) => (
                    <option key={key} value={key}>
                      {t(key)}
                    </option>
                  ),
                )}
              </select>
            </label>
            <div className="studio-palettes">
              {quotePalettes.map((palette, i) => (
                <button
                  key={i}
                  aria-label={`${t("background")} ${i + 1}`}
                  style={{
                    background: palette.background,
                    color: palette.foreground,
                  }}
                  onClick={() => patch(palette)}
                >
                  Aa
                </button>
              ))}
            </div>
            <div className="book-fields-row">
              <label>
                {t("font")}
                <select
                  value={design.font}
                  onChange={(e) =>
                    patch({ font: e.target.value as QuoteDesign["font"] })
                  }
                >
                  <option value="serif">{t("serif")}</option>
                  <option value="sans">{t("sans")}</option>
                </select>
              </label>
              <label>
                {t("align")}
                <select
                  value={design.align}
                  onChange={(e) =>
                    patch({ align: e.target.value as QuoteDesign["align"] })
                  }
                >
                  {(["start", "center", "end"] as const).map((key) => (
                    <option key={key} value={key}>
                      {t(key)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {slider("fontSize", "size", 32, 88, 2)}
            {slider("lineHeight", "spacing", 1.1, 1.8, 0.05)}
            {slider("padding", "padding", 48, 160, 4)}
            <div className="studio-colors">
              {(["background", "foreground", "accent"] as const).map((key) => (
                <label key={key}>
                  {t(key)}
                  <input
                    type="color"
                    value={design[key]}
                    onChange={(e) => patch({ [key]: e.target.value })}
                  />
                </label>
              ))}
            </div>
            <label>
              {t("image")}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    patch({ backgroundImage: await quoteBackground(file) });
                    setError("");
                  } catch {
                    setError(t("imageError"));
                  }
                  e.target.value = "";
                }}
              />
            </label>
            {design.backgroundImage && (
              <>
                <button
                  className="button secondary"
                  onClick={() => patch({ backgroundImage: undefined })}
                >
                  {t("removeImage")}
                </button>
                {slider("imageShade", "shade", 0, 1, 0.05)}
              </>
            )}
            <fieldset>
              <legend>{t("attribution")}</legend>
              {(
                ["showTitle", "showAuthor", "showBrand", "showPage"] as const
              ).map((key, i) => (
                <label className="studio-toggle" key={key}>
                  <input
                    type="checkbox"
                    checked={design[key]}
                    onChange={(e) => patch({ [key]: e.target.checked })}
                  />
                  {t(
                    (
                      [
                        "titleToggle",
                        "authorToggle",
                        "brandToggle",
                        "pageToggle",
                      ] as const
                    )[i],
                  )}
                </label>
              ))}
            </fieldset>
          </div>
        </div>
        {error && <p role="alert">{error}</p>}
        <footer className="studio-footer">
          <button
            className="button secondary"
            onClick={() => {
              onSave(design);
              onClose();
            }}
          >
            {t("saveDesign")}
          </button>
          <button
            className="button secondary"
            disabled={busy || rendering}
            onClick={() => void output(false)}
          >
            <DownloadSimple size={20} />
            {t("download")}
          </button>
          <button
            className="button primary"
            disabled={busy || rendering}
            onClick={() => void output(true)}
          >
            <ShareNetwork size={20} />
            {t("share")}
          </button>
        </footer>
      </section>
    </div>
  );
}
