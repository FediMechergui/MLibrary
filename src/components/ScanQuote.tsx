import { useEffect, useRef, useState } from "react";
import { X, Scan, CircleNotch } from "@phosphor-icons/react";
import type { Language, ReaderSelection, ReadingAnchor } from "../types";
import { studioText } from "../lib/studio-i18n";
import { onlineOcrAvailable, recognizeImage } from "../lib/ocr";
type Region = NonNullable<ReadingAnchor["region"]>;
export function ScanQuote({
  preview,
  language,
  page,
  onCrop,
  onSelect,
  onClose,
}: {
  preview: HTMLCanvasElement;
  language: Language;
  page: number;
  onCrop: (region: Region, signal: AbortSignal) => Promise<HTMLCanvasElement>;
  onSelect: (selection: ReaderSelection) => void;
  onClose: () => void;
}) {
  const t = studioText(language),
    surface = useRef<HTMLDivElement>(null),
    dialog = useRef<HTMLElement>(null),
    controller = useRef<AbortController | null>(null),
    start = useRef<{ x: number; y: number } | null>(null),
    choice = useRef(false);
  const [image] = useState(() => preview.toDataURL("image/png")),
    [region, setRegion] = useState<Region>({ x: 0, y: 0, width: 1, height: 1 }),
    [method, setMethod] = useState<"local" | "online">("local"),
    [available, setAvailable] = useState(false),
    [lang, setLang] = useState(language),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [selected, setSelected] = useState({ start: 0, end: 0 });
  useEffect(() => {
    dialog.current?.focus();
    const control = new AbortController();
    void onlineOcrAvailable(control.signal).then((online) => {
      if (!control.signal.aborted) {
        setAvailable(online);
        if (online && !choice.current) setMethod("online");
      }
    });
    return () => {
      control.abort();
      controller.current?.abort();
    };
  }, []);
  const point = (event: React.PointerEvent) => {
    const box = surface.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
    };
  };
  const move = (event: React.PointerEvent) => {
    if (!start.current) return;
    const p = point(event),
      a = start.current;
    setRegion({
      x: Math.min(a.x, p.x),
      y: Math.min(a.y, p.y),
      width: Math.abs(p.x - a.x),
      height: Math.abs(p.y - a.y),
    });
  };
  const extract = async () => {
    if (region.width < 0.02 || region.height < 0.02) {
      setError(t("cropSmall"));
      return;
    }
    controller.current?.abort();
    const control = new AbortController();
    controller.current = control;
    setBusy(true);
    setError("");
    setText("");
    setProgress(0);
    try {
      const canvas = await onCrop(region, control.signal);
      const result = await recognizeImage(
        canvas,
        lang,
        method,
        control.signal,
        setProgress,
      );
      if (control.signal.aborted) return;
      setText(result.trim());
      setSelected({ start: 0, end: 0 });
      if (!result.trim()) setError(t("noText"));
    } catch {
      if (!control.signal.aborted) setError(t("ocrError"));
    } finally {
      if (!control.signal.aborted) setBusy(false);
    }
  };
  const useText = (all: boolean) => {
    const value = (
      all ? text : text.slice(selected.start, selected.end)
    ).trim();
    if (!value) return;
    onClose();
    onSelect({
      text: value.slice(0, 5000),
      anchor: { type: "pdf", page, ocr: true, region },
    });
  };
  return (
    <div className="studio-overlay" data-reader-overlay>
      <section
        className="scan-quote"
        role="dialog"
        aria-modal="true"
        aria-label={t("scan")}
        ref={dialog}
        tabIndex={-1}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") onClose();
          if (event.key === "Tab") {
            const nodes = dialog.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled),input,textarea,select,[tabindex="0"]',
            );
            if (nodes?.length) {
              const first = nodes[0],
                last = nodes[nodes.length - 1];
              if (
                event.shiftKey &&
                (document.activeElement === first ||
                  document.activeElement === dialog.current)
              ) {
                event.preventDefault();
                last.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
              }
            }
          }
        }}
      >
        <header className="panel-heading">
          <strong>
            <Scan size={22} />
            {t("scan")}
          </strong>
          <button
            className="icon-button"
            aria-label={t("cancel")}
            data-modal-close
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </header>
        <p>{t("cropHint")}</p>
        <div
          className="ocr-crop-surface"
          ref={surface}
          tabIndex={0}
          role="group"
          aria-label={t("crop")}
          aria-disabled={busy}
          style={{
            maxWidth: Math.min(620, (480 * preview.width) / preview.height),
          }}
          onPointerDown={(event) => {
            if (busy) return;
            event.preventDefault();
            surface.current?.focus();
            surface.current?.setPointerCapture(event.pointerId);
            start.current = point(event);
            setRegion({ ...start.current, width: 0, height: 0 });
          }}
          onPointerMove={move}
          onPointerUp={(event) => {
            move(event);
            start.current = null;
          }}
          onPointerCancel={() => {
            start.current = null;
          }}
          onKeyDown={(event) => {
            if (busy || !event.key.startsWith("Arrow")) return;
            event.preventDefault();
            const dx =
                event.key === "ArrowRight"
                  ? 0.01
                  : event.key === "ArrowLeft"
                    ? -0.01
                    : 0,
              dy =
                event.key === "ArrowDown"
                  ? 0.01
                  : event.key === "ArrowUp"
                    ? -0.01
                    : 0;
            setRegion((r) =>
              event.shiftKey
                ? {
                    ...r,
                    width: Math.max(0.03, Math.min(1 - r.x, r.width + dx)),
                    height: Math.max(0.03, Math.min(1 - r.y, r.height + dy)),
                  }
                : {
                    ...r,
                    x: Math.max(0, Math.min(1 - r.width, r.x + dx)),
                    y: Math.max(0, Math.min(1 - r.height, r.y + dy)),
                  },
            );
          }}
        >
          <img src={image} alt={t("crop")} draggable={false} />
          <span
            className="ocr-region"
            style={{
              left: `${region.x * 100}%`,
              top: `${region.y * 100}%`,
              width: `${region.width * 100}%`,
              height: `${region.height * 100}%`,
            }}
          />
        </div>
        <div className="ocr-controls">
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => setRegion({ x: 0, y: 0, width: 1, height: 1 })}
          >
            {t("fullPage")}
          </button>
          <label>
            {t("ocrLanguage")}
            <select
              value={lang}
              disabled={busy}
              onChange={(e) => setLang(e.target.value as Language)}
            >
              <option value="en">English</option>
              <option value="fr">Français</option>
              <option value="ar">العربية</option>
            </select>
          </label>
          <label>
            {t("source")}
            <select
              value={method}
              disabled={busy}
              onChange={(e) => {
                choice.current = true;
                setMethod(e.target.value as "local" | "online");
              }}
            >
              <option value="local">{t("local")}</option>
              <option value="online" disabled={!available}>
                {t("online")}
              </option>
            </select>
          </label>
        </div>
        {method === "online" && (
          <p className="ocr-disclosure">{t("onlineNote")}</p>
        )}
        {busy ? (
          <div role="status">
            <CircleNotch className="spin" size={22} />
            {t("recognizing")}
            <progress value={progress} max="1" aria-label={t("recognizing")} />
            <button
              className="button secondary"
              onClick={() => {
                controller.current?.abort();
                setBusy(false);
              }}
            >
              {t("cancel")}
            </button>
          </div>
        ) : (
          <button className="button primary" onClick={() => void extract()}>
            {t("recognize")}
          </button>
        )}
        {error && <p role="alert">{error}</p>}
        {text && (
          <div className="ocr-result">
            <label>
              {t("result")}
              <textarea
                value={text}
                rows={7}
                dir="auto"
                maxLength={30000}
                onChange={(e) => {
                  setText(e.target.value);
                  setSelected({ start: 0, end: 0 });
                }}
                onSelect={(e) =>
                  setSelected({
                    start: e.currentTarget.selectionStart,
                    end: e.currentTarget.selectionEnd,
                  })
                }
              />
            </label>
            <p>{t("resultHint")}</p>
            <div className="editor-actions">
              <button
                className="button primary"
                disabled={
                  selected.end <= selected.start ||
                  selected.end - selected.start > 5000
                }
                onClick={() => useText(false)}
              >
                {t("useSelection")}
              </button>
              <button
                className="button secondary"
                disabled={text.length > 5000}
                onClick={() => useText(true)}
              >
                {t("useAll")}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
